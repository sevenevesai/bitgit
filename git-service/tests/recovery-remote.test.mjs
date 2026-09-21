import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { RecoveryService } from '../dist/recovery-service.js';
import { validateBackupRemote } from '../dist/recovery-remote.js';
import { sha256 } from '../dist/recovery-io.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-recovery-remote-'));
  const source = path.join(root, 'source'), remote = path.join(root, 'remote with spaces.git');
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'app.txt'), 'known bytes\r\n');
  const init = spawnSync('git', ['init', '--bare', '--initial-branch=main', remote], { encoding: 'utf8', windowsHide: true });
  assert.equal(init.status, 0, init.stderr);
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-recovery-remote-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const service = new RecoveryService(source, { vaultRoot: path.join(root, 'vault') });
  const saved = await service.dispatch({ action: 'create', label: 'Ready to recover', note: 'A named source milestone' });
  return { root, source, remote, service, saved };
}

test('an imported NTFS alias cannot enter local history or overwrite Git hooks', async t => {
  const { root, remote, service, saved } = await fixture(t);
  const bytes = Buffer.from('untrusted hook bytes');
  const oid = async (args, input) => (await service.git(args, input)).toString().trim();
  const blob = await oid(['hash-object', '-w', '--stdin'], bytes);
  const hooks = await oid(['mktree', '-z'], `100644 blob ${blob}\tpre-commit\0`);
  const gitTree = await oid(['mktree', '-z'], `040000 tree ${hooks}\thooks\0`);
  const tree = await oid(['mktree', '-z'], `040000 tree ${gitTree}\tGIT~1\0`);
  const { manifest } = await service.readManifest(saved.commitOid);
  const file = 'GIT~1/hooks/pre-commit';
  manifest.entries = [{ path: file, mode: '100644', sizeBytes: bytes.length, sha256: sha256(bytes) }];
  manifest.coverage.included = [{ path: file, sizeBytes: bytes.length }];
  manifest.coverage.excluded = [];
  manifest.coverage.totalBytes = bytes.length;
  manifest.fingerprint = sha256(JSON.stringify([[file, '100644', sha256(bytes)]]));
  const forged = await oid(['commit-tree', tree], JSON.stringify(manifest));
  const ref = `refs/heads/bitgit-checkpoints/${service.vaultKey}/${saved.id}`;
  await service.git(['push', remote, `${forged}:${ref}`]);
  const victim = path.join(root, 'victim');
  const init = spawnSync('git', ['init', victim], { encoding: 'utf8', windowsHide: true });
  assert.equal(init.status, 0, init.stderr);
  const fresh = new RecoveryService(victim, { vaultRoot: path.join(root, 'fresh-vault') });
  await assert.rejects(fresh.dispatch({ action: 'remoteImport', remoteUrl: remote, ref }), /unsafe file path/);
  assert.equal((await fresh.dispatch({ action: 'state' })).checkpoints.length, 0);
  assert.equal(await fs.stat(path.join(victim, '.git', 'hooks', 'pre-commit')).then(() => true, () => false), false);
});

test('backup verifies an independent ref and imports into a fresh vault after source loss', async t => {
  const { root, source, remote, service, saved } = await fixture(t);
  const receipt = await service.dispatch({ action: 'backup', checkpointId: saved.id, remoteUrl: remote });
  assert.equal(receipt.commitOid, saved.commitOid); assert.ok(receipt.verifiedAt);
  const refs = spawnSync('git', ['--git-dir', remote, 'for-each-ref', '--format=%(refname)'], { encoding: 'utf8', windowsHide: true });
  assert.equal(refs.stdout.trim(), receipt.ref);
  const parents = spawnSync('git', ['--git-dir', remote, 'cat-file', '-p', saved.commitOid], { encoding: 'utf8', windowsHide: true });
  assert.ok(!/^parent /m.test(parents.stdout));
  assert.equal(path.dirname(source), root); await fs.rm(source, { recursive: true });
  const fresh = new RecoveryService(path.join(root, 'new-machine-project'), { vaultRoot: path.join(root, 'fresh-vault') });
  const available = await fresh.dispatch({ action: 'remoteList', remoteUrl: remote });
  assert.equal(available.length, 1);
  const imported = await fresh.dispatch({ action: 'remoteImport', remoteUrl: remote, ref: available[0].ref });
  assert.equal(imported.id, saved.id); assert.equal(imported.note, saved.note); assert.equal(imported.commitOid, saved.commitOid);
  const dest = path.join(root, 'recovered-from-remote');
  await fresh.dispatch({ action: 'recover', checkpointId: imported.id, destination: dest });
  assert.equal(await fs.readFile(path.join(dest, 'app.txt'), 'utf8'), 'known bytes\r\n');
});

test('failed remote recheck persists the failure without inventing a new verified timestamp', async t => {
  const { remote, service, saved } = await fixture(t);
  const receipt = await service.dispatch({ action: 'backup', checkpointId: saved.id, remoteUrl: remote });
  const removed = spawnSync('git', ['--git-dir', remote, 'update-ref', '-d', receipt.ref], { encoding: 'utf8', windowsHide: true });
  assert.equal(removed.status, 0);
  await assert.rejects(service.dispatch({ action: 'verifyBackup', checkpointId: saved.id }), /not verified/);
  const checkpoint = (await service.dispatch({ action: 'state' })).checkpoints[0];
  assert.equal(checkpoint.backup.verifiedAt, receipt.verifiedAt);
  assert.match(checkpoint.backup.lastCheckError, /not verified/);
});

test('backup never forces replacement of a conflicting remote checkpoint', async t => {
  const { remote, service, saved, source } = await fixture(t);
  const receipt = await service.dispatch({ action: 'backup', checkpointId: saved.id, remoteUrl: remote });
  await fs.writeFile(path.join(source, 'app.txt'), 'second version');
  const another = await service.dispatch({ action: 'create', label: 'Another checkpoint' });
  await service.dispatch({ action: 'backup', checkpointId: another.id, remoteUrl: remote });
  const changed = spawnSync('git', ['--git-dir', remote, 'update-ref', receipt.ref, another.commitOid], { encoding: 'utf8', windowsHide: true });
  assert.equal(changed.status, 0);
  await assert.rejects(service.dispatch({ action: 'backup', checkpointId: saved.id, remoteUrl: remote }), /Remote operation failed/);
  const head = spawnSync('git', ['--git-dir', remote, 'rev-parse', receipt.ref], { encoding: 'utf8', windowsHide: true });
  assert.equal(head.stdout.trim(), another.commitOid);
});

test('remote validation rejects executable helpers, credentials, unsafe refs and source destinations', async t => {
  const { service, saved, source } = await fixture(t);
  for (const remote of ['ext::arbitrary-command', '--upload-pack=bad', 'https://token:secret@github.com/test/repo', 'ssh://evil:password@host/repo', 'http://host/repo', 'https://host/repo?token=secret', source]) {
    assert.throws(() => validateBackupRemote(service, remote));
  }
  await assert.rejects(service.dispatch({ action: 'remoteImport', remoteUrl: 'https://github.com/example/repo', ref: 'refs/heads/main' }), /Select a BitGit checkpoint ref/);
  assert.equal((await service.dispatch({ action: 'state' })).checkpoints[0].id, saved.id);
});

test('remote import rejects a forged manifest and does not publish a local checkpoint ref', async t => {
  const { root, remote, service, saved } = await fixture(t);
  const { manifest } = await service.readManifest(saved.commitOid);
  manifest.coverage.totalBytes = 999;
  const forged = (await service.git(['commit-tree', saved.treeOid], JSON.stringify(manifest))).toString().trim();
  const ref = `refs/heads/bitgit-checkpoints/${service.vaultKey}/${saved.id}`;
  await service.git(['push', remote, `${forged}:${ref}`]);
  const fresh = new RecoveryService(path.join(root, 'other-source'), { vaultRoot: path.join(root, 'other-vault') });
  await assert.rejects(fresh.dispatch({ action: 'remoteImport', remoteUrl: remote, ref }), /coverage does not match/);
  assert.equal((await fresh.dispatch({ action: 'state' })).checkpoints.length, 0);
});
