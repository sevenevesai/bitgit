import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { RecoveryService } from '../dist/recovery-service.js';
import { safeRelative, withVaultLock, sha256 } from '../dist/recovery-io.js';

const fixtures = async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-recovery-core-'));
  const repo = path.join(root, 'project'), vaultRoot = path.join(root, 'vault');
  await fs.mkdir(repo);
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-recovery-core-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Recovery Test', '-c', 'user.email=recovery@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', windowsHide: true,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'experiment');
  const write = (file, content) => fs.writeFile(path.join(repo, file), content);
  await write('app.txt', 'working\r\n');
  git('add', 'app.txt'); git('commit', '-m', 'Initial working app');
  return { root, repo, git, write, service: new RecoveryService(repo, { vaultRoot }) };
};

test('checkpoint captures exact working bytes and untracked source without changing HEAD or staging', async t => {
  const { root, repo, service, git, write } = await fixtures(t);
  await write('app.txt', 'staged version\r\n'); git('add', 'app.txt');
  await write('app.txt', 'latest working version\r\n');
  await write('spaced ünicode.txt', Buffer.from([0, 1, 2, 13, 10, 255]));
  await write('package-lock.json', '{"lockfileVersion":3}\n');
  const beforeHead = git('rev-parse', 'HEAD'), beforeIndex = await fs.readFile(path.join(repo, '.git', 'index'));
  const preview = await service.dispatch({ action: 'preview' });
  const checkpoint = await service.dispatch({ action: 'create', label: 'Login works', expectedFingerprint: preview.fingerprint });
  assert.equal(checkpoint.branch, 'experiment');
  assert.equal(git('rev-parse', 'HEAD'), beforeHead);
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'index')), beforeIndex);
  assert.equal(git('show', ':app.txt'), 'staged version');
  const recovered = path.join(root, 'recovered');
  const receipt = await service.dispatch({ action: 'recover', checkpointId: checkpoint.id, destination: recovered });
  assert.equal(receipt.fileCount, 3);
  for (const file of ['app.txt', 'spaced ünicode.txt', 'package-lock.json']) {
    assert.deepEqual(await fs.readFile(path.join(recovered, file)), await fs.readFile(path.join(repo, file)));
  }
  assert.equal(await fs.stat(path.join(recovered, '.git')).then(() => true, () => false), false);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints[0].recoveredAt, receipt.verifiedAt);
});

test('coverage records ignored files, plain env files and content credentials; selections are explicit', async t => {
  const { service, write } = await fixtures(t);
  await write('.gitignore', 'ignored.txt\n'); await write('ignored.txt', 'ignored');
  await write('.env', 'TOKEN=private');
  await write('config.ts', `export const value = "ghp_${'A'.repeat(36)}";`);
  await write('keep.ts', 'source');
  const preview = await service.dispatch({ action: 'preview' });
  for (const name of ['ignored.txt', '.env', 'config.ts']) assert.ok(preview.coverage.excluded.some(file => file.path === name));
  assert.ok(preview.coverage.included.some(file => file.path === 'keep.ts'));
  const saved = await service.dispatch({ action: 'create', label: 'Only selected source', expectedFingerprint: preview.fingerprint, excludedPaths: ['keep.ts'] });
  assert.ok(saved.coverage.excluded.some(file => file.path === 'keep.ts' && file.reason === 'Excluded by your selection'));
  assert.ok(!saved.coverage.included.some(file => file.path === 'keep.ts'));
  await assert.rejects(service.dispatch({ action: 'create', label: 'Bad selection', excludedPaths: ['missing.ts'] }), /selection/i);
});

test('stale preview fails without publishing a checkpoint', async t => {
  const { service, write } = await fixtures(t);
  const preview = await service.dispatch({ action: 'preview' });
  await write('app.txt', 'an agent edited this');
  await assert.rejects(service.dispatch({ action: 'create', label: 'Stale', expectedFingerprint: preview.fingerprint }), /changed after the preview/);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints.length, 0);
});

test('comparison describes restoring additions, replacements and deletions', async t => {
  const { service, repo, write } = await fixtures(t);
  await write('restore.txt', 'old content');
  const saved = await service.dispatch({ action: 'create', label: 'Before edit' });
  await fs.rm(path.join(repo, 'restore.txt')); await write('app.txt', 'new version'); await write('new.txt', 'new file');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  assert.deepEqual(comparison.changes.map(file => [file.path, file.kind]), [['app.txt', 'replace'], ['new.txt', 'delete'], ['restore.txt', 'add']]);
  assert.equal(comparison.changes[0].after, 'working\r\n');
});

test('vault recovers code after the source folder and its git directory are gone', async t => {
  const { service, repo, root } = await fixtures(t);
  const saved = await service.dispatch({ action: 'create', label: 'Survives source deletion' });
  assert.equal(path.dirname(repo), root); await fs.rm(repo, { recursive: true });
  const state = await service.dispatch({ action: 'state' });
  assert.equal(state.sourceAvailable, false); assert.equal(state.checkpoints.length, 1);
  const dest = path.join(root, 'recovered-after-loss');
  await service.dispatch({ action: 'recover', checkpointId: saved.id, destination: dest });
  assert.equal(await fs.readFile(path.join(dest, 'app.txt'), 'utf8'), 'working\r\n');
});

test('recovery rejects existing destinations, source descendants and unsafe identifiers', async t => {
  const { service, repo, root } = await fixtures(t);
  const saved = await service.dispatch({ action: 'create', label: 'Safe recovery' });
  const existing = path.join(root, 'existing'); await fs.mkdir(existing); await fs.writeFile(path.join(existing, 'sentinel'), 'keep');
  await assert.rejects(service.dispatch({ action: 'recover', checkpointId: saved.id, destination: existing }), /already exists/);
  await assert.rejects(service.dispatch({ action: 'recover', checkpointId: saved.id, destination: path.join(repo, 'copy') }), /separate folder/);
  await assert.rejects(service.dispatch({ action: 'recover', checkpointId: '../bad', destination: path.join(root, 'bad') }), /Invalid checkpoint/);
  assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'keep');
  for (const name of ['../escape', '.git/config', 'folder\\escape', 'CON.txt', 'foo:bar', 'trailing.']) assert.throws(() => safeRelative(name));
});

test('ordinary folder captures without initializing Git', async t => {
  const { service, repo } = await fixtures(t);
  await fs.rm(path.join(repo, '.git'), { recursive: true });
  const checkpoint = await service.dispatch({ action: 'create', label: 'Plain folder' });
  assert.equal(checkpoint.head, null); assert.equal(checkpoint.branch, null);
  assert.equal(await fs.stat(path.join(repo, '.git')).then(() => true, () => false), false);
});

test('links and linked parents cannot escape capture or recovery', async t => {
  const { service, root, repo } = await fixtures(t);
  const external = path.join(root, 'external'); await fs.mkdir(external); await fs.writeFile(path.join(external, 'private.txt'), 'outside project');
  await fs.symlink(external, path.join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const preview = await service.dispatch({ action: 'preview' });
  assert.ok(!preview.coverage.included.some(file => file.path.startsWith('linked/')));
  const saved = await service.dispatch({ action: 'create', label: 'No links' });
  const linkedParent = path.join(root, 'linked-destination'); await fs.symlink(external, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(service.dispatch({ action: 'recover', checkpointId: saved.id, destination: path.join(linkedParent, 'copy') }), /Linked paths/);
});

test('multiple service instances serialize writes and active process locks fail clearly', async t => {
  const { service, repo } = await fixtures(t);
  const second = new RecoveryService(repo, { vaultRoot: path.dirname(service.vaultPath) });
  const saves = await Promise.all([service.dispatch({ action: 'create', label: 'One' }), second.dispatch({ action: 'create', label: 'Two' })]);
  assert.notEqual(saves[0].id, saves[1].id);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints.length, 2);
  const lock = path.join(service.vaultPath, 'operation.lock');
  await fs.writeFile(lock, JSON.stringify({ pid: process.pid, token: 'other-owner' }));
  await assert.rejects(withVaultLock(service.vaultPath, async () => {}), /Another recovery operation/);
  assert.equal(JSON.parse(await fs.readFile(lock, 'utf8')).token, 'other-owner'); await fs.rm(lock);
});

test('tampered checkpoint objects do not report successful recovery', async t => {
  const { service, root } = await fixtures(t);
  const saved = await service.dispatch({ action: 'create', label: 'Verified content' });
  const blob = (await service.git(['ls-tree', saved.commitOid])).toString('utf8').split(' ')[2].split('\t')[0];
  const object = path.join(service.gitDir, 'objects', blob.slice(0, 2), blob.slice(2));
  await fs.chmod(object, 0o600); await fs.writeFile(object, 'not a valid git object');
  const destination = path.join(root, 'corrupt-copy');
  await assert.rejects(service.dispatch({ action: 'recover', checkpointId: saved.id, destination }));
  assert.equal(await fs.stat(destination).then(() => true, () => false), false);
});

test('selected repair preserves unrelated changes and staging, and retains a recoverable safety milestone', async t => {
  const { service, root, repo, git, write } = await fixtures(t);
  await write('style.css', 'old styling');
  const saved = await service.dispatch({ action: 'create', label: 'Login works' });
  await write('app.txt', 'staged refactor'); git('add', 'app.txt'); await write('app.txt', 'broken login');
  await write('style.css', 'keep this new styling'); await write('new.txt', 'keep new feature');
  const index = await fs.readFile(path.join(repo, '.git', 'index'));
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  const receipt = await service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: comparison.currentFingerprint });
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), 'working\r\n');
  assert.equal(await fs.readFile(path.join(repo, 'style.css'), 'utf8'), 'keep this new styling');
  assert.equal(await fs.readFile(path.join(repo, 'new.txt'), 'utf8'), 'keep new feature');
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'index')), index);
  const safety = (await service.dispatch({ action: 'state' })).checkpoints.find(checkpoint => checkpoint.id === receipt.safetyCheckpointId);
  assert.equal(safety.kind, 'safety');
  const restored = path.join(root, 'current-attempt');
  await service.dispatch({ action: 'recover', checkpointId: safety.id, destination: restored });
  assert.equal(await fs.readFile(path.join(restored, 'app.txt'), 'utf8'), 'broken login');
});

test('repair rejects stale comparisons and refuses to overwrite contents outside safety coverage', async t => {
  const { service, repo, write } = await fixtures(t);
  const saved = await service.dispatch({ action: 'create', label: 'Original' });
  await write('app.txt', 'changed');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  await write('app.txt', 'edited after comparison');
  await assert.rejects(service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: comparison.currentFingerprint }), /changed after comparison/);
  const secret = `ghp_${'B'.repeat(36)}`; await write('app.txt', secret);
  const latest = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  await assert.rejects(service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: latest.currentFingerprint }), /Cannot protect current contents/);
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), secret);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints.length, 1);
});

test('interrupted repair remains visible, preserves later edits, and rolls back after they are resolved', async t => {
  const { service, repo, write } = await fixtures(t);
  await write('second.txt', 'original second');
  const saved = await service.dispatch({ action: 'create', label: 'Old version' });
  await write('app.txt', 'current app'); await write('second.txt', 'current second');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  const originalSave = service.saveCaptured.bind(service);
  service.saveCaptured = async (...args) => {
    const checkpoint = await originalSave(...args);
    // Deterministically model an editor writing after the safety snapshot but before repair.
    await write('second.txt', 'concurrent edit');
    return checkpoint;
  };
  await assert.rejects(service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt', 'second.txt'], expectedFingerprint: comparison.currentFingerprint }), /Repair is incomplete/);
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), 'working\r\n');
  assert.equal((await service.dispatch({ action: 'state' })).pendingRepair.affectedFiles, 2);
  await assert.rejects(service.dispatch({ action: 'create', label: 'Do not capture partial repair' }), /interrupted/);
  await assert.rejects(service.dispatch({ action: 'repairRollback' }), /New edits were found/);
  assert.equal(await fs.readFile(path.join(repo, 'second.txt'), 'utf8'), 'concurrent edit');
  await write('second.txt', 'current second');
  await service.dispatch({ action: 'repairRollback' });
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), 'current app');
  assert.equal((await service.dispatch({ action: 'state' })).pendingRepair, null);
});

test('repair can protect an empty current source before restoring a deleted file', async t => {
  const { service, repo } = await fixtures(t);
  const saved = await service.dispatch({ action: 'create', label: 'Before deletion' });
  await fs.rm(path.join(repo, 'app.txt'));
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  const receipt = await service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt'], expectedFingerprint: comparison.currentFingerprint });
  const state = await service.dispatch({ action: 'state' });
  assert.equal(state.checkpoints.find(checkpoint => checkpoint.id === receipt.safetyCheckpointId).coverage.included.length, 0);
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), 'working\r\n');
});
