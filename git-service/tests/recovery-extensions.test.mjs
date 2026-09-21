import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RecoveryService } from '../dist/recovery-service.js';
import { parseCliArgs, parseCliRequest } from '../dist/recovery-cli.js';

const MINUTE = 60_000;
const START = Date.parse('2026-09-21T10:00:00.000Z');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not-a-real-image-but-a-real-signature')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-body')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 body')]);
const ENABLED = { automaticEnabled: true, idleMinutes: 5, retention: 'keep_all' };
const HOLDER = /^bitgit-check-/;

const fixtures = async (t, { git: useGit = false, githubToken } = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-recovery-ext-'));
  const repo = path.join(root, 'project'), vaultRoot = path.join(root, 'vault');
  await fs.mkdir(repo);
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'bitgit-recovery-ext-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const clock = { time: START };
  const options = { vaultRoot, now: () => new Date(clock.time), githubToken };
  const service = new RecoveryService(repo, options);
  const write = (file, content) => fs.writeFile(path.join(repo, file), content);
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Extension Test', '-c', 'user.email=extension@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', windowsHide: true,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  await write('app.txt', 'working\r\n');
  if (useGit) { git('init', '-b', 'experiment'); git('add', 'app.txt'); git('commit', '-m', 'Initial working app'); }
  const save = async (label, content) => {
    if (content !== undefined) await write('app.txt', content);
    clock.time += MINUTE;
    return service.dispatch({ action: 'create', label });
  };
  const state = () => service.dispatch({ action: 'state' });
  const tick = () => service.dispatch({ action: 'autoTick' });
  const enable = (extra = {}) => service.dispatch({ action: 'settings', settings: { ...ENABLED, ...extra } });
  return { root, repo, vaultRoot, service, clock, write, git, save, state, tick, enable, options };
};

const keepCopy = (t, evidence) => t.after(async () => {
  const holder = path.dirname(evidence.workingCopyPath);
  assert.ok(HOLDER.test(path.basename(holder)) && path.dirname(holder) === path.resolve(os.tmpdir()));
  await fs.rm(holder, { recursive: true, force: true });
});
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const listFiles = async directory => (await fs.readdir(directory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
  .map(entry => path.relative(directory, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/')).sort();

// ---------- settings and automatic saves ----------

test('malformed settings disable automation while recovery history stays available', async t => {
  const { service, state, enable, vaultRoot, repo } = await fixtures(t);
  assert.deepEqual((await state()).settings, { automaticEnabled: false, idleMinutes: 5, retention: 'keep_all' });
  const invalid = [
    [{ ...ENABLED, automaticEnabled: 'yes' }, /automaticEnabled/],
    [{ ...ENABLED, idleMinutes: 0 }, /Idle time/], [{ ...ENABLED, idleMinutes: 61 }, /Idle time/],
    [{ ...ENABLED, idleMinutes: 2.5 }, /Idle time/], [{ ...ENABLED, idleMinutes: '5' }, /Idle time/],
    [{ ...ENABLED, retention: 'delete_old' }, /keep_all/],
    [{ ...ENABLED, excludedPaths: 'a.txt' }, /excludedPaths/], [{ ...ENABLED, excludedPaths: [1] }, /excludedPaths/],
    [{ ...ENABLED, excludedPaths: ['../escape.txt'] }, /unsafe/i], [{ ...ENABLED, excludedPaths: ['a.txt', 'a.txt'] }, /more than once/],
    [{ ...ENABLED, excludedPaths: ['C:/abs.txt'] }, /unsafe/i], [{ ...ENABLED, excludedPaths: ['dir\\file.txt'] }, /unsafe/i],
    [{ ...ENABLED, excludedPaths: ['.git/config'] }, /unsafe/i],
    [{ ...ENABLED, surprise: true }, /Unknown automatic-save setting/], [null, /object/], [[], /object/],
  ];
  for (const [settings, message] of invalid) await assert.rejects(service.dispatch({ action: 'settings', settings }), message, JSON.stringify(settings));
  assert.equal((await state()).settings.automaticEnabled, false, 'rejected settings are not persisted');

  const wanted = { automaticEnabled: true, idleMinutes: 10, excludedPaths: ['notes/private.md'], retention: 'keep_all' };
  assert.deepEqual(await enable({ idleMinutes: 10, excludedPaths: ['notes/private.md'] }), wanted);
  assert.deepEqual((await new RecoveryService(repo, { vaultRoot }).dispatch({ action: 'state' })).settings, wanted, 'a new process sees the same settings');

  const file = path.join(service.vaultPath, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ automaticEnabled: 'maybe', idleMinutes: 5, retention: 'keep_all' }));
  const invalidState = await state();
  assert.match(invalidState.settingsError, /Saved automatic-save settings are invalid/);
  assert.equal(invalidState.settings.automaticEnabled, false);
  await assert.rejects(service.dispatch({ action: 'autoTick' }), /invalid/);
  await fs.writeFile(file, 'not json');
  assert.match((await state()).settingsError, /settings\.json/);
  await enable();
  assert.equal((await state()).settings.automaticEnabled, true, 'saving valid settings replaces the malformed file');
});

test('a disabled automatic tick neither reads the source nor saves anything', async t => {
  const { service, repo, state } = await fixtures(t);
  await fs.rm(repo, { recursive: true, force: true });
  assert.deepEqual(await service.dispatch({ action: 'autoTick' }), { checkpoint: null, reason: 'disabled' });
  const current = await state();
  assert.equal(current.checkpoints.length, 0);
  assert.equal(current.sourceAvailable, false);
});

test('automatic saves wait for stable content, reset on edits, keep every checkpoint and deduplicate', async t => {
  const { repo, git, write, clock, state, tick, enable, save } = await fixtures(t, { git: true });
  const head = git('rev-parse', 'HEAD'), index = await fs.readFile(path.join(repo, '.git', 'index'));
  await enable();
  assert.deepEqual(await tick(), { checkpoint: null, reason: 'waiting-for-idle' }, 'the first observation never saves');
  clock.time += 4 * MINUTE;
  assert.equal((await tick()).reason, 'waiting-for-idle');
  await write('app.txt', 'edited while watching\r\n');
  assert.equal((await tick()).reason, 'waiting-for-idle', 'an edit restarts the idle wait');
  clock.time += 5 * MINUTE - 1000;
  assert.equal((await tick()).reason, 'waiting-for-idle', 'one second short of the idle time');
  assert.equal((await state()).checkpoints.length, 0);
  clock.time += 1000;
  const saved = await tick();
  assert.equal(saved.reason, 'saved');
  assert.equal(saved.checkpoint.kind, 'automatic');
  assert.equal(saved.checkpoint.createdAt, new Date(clock.time).toISOString());
  assert.equal(saved.checkpoint.label, `Automatic save ${new Date(clock.time).toISOString()}`);
  assert.equal(saved.checkpoint.branch, 'experiment');
  assert.deepEqual(saved.checkpoint.coverage.included.map(file => file.path), ['app.txt']);
  assert.equal(git('rev-parse', 'HEAD'), head);
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'index')), index);
  assert.equal(await fs.readFile(path.join(repo, 'app.txt'), 'utf8'), 'edited while watching\r\n');

  assert.deepEqual(await tick(), { checkpoint: null, reason: 'unchanged' });
  clock.time += 10 * MINUTE;
  assert.equal((await tick()).reason, 'unchanged');
  await save('Manual copy of the same files');
  assert.equal((await tick()).reason, 'unchanged', 'the newest checkpoint of any kind is the dedup baseline');
  assert.equal((await state()).checkpoints.length, 2);

  await write('app.txt', 'second edit\r\n');
  assert.equal((await tick()).reason, 'waiting-for-idle');
  clock.time += 5 * MINUTE;
  const second = await tick();
  assert.equal(second.reason, 'saved');
  const kinds = (await state()).checkpoints.map(checkpoint => checkpoint.kind).sort();
  assert.deepEqual(kinds, ['automatic', 'automatic', 'manual'], 'nothing is pruned');
});

test('changing settings restarts the observation; saving identical settings does not', async t => {
  const { write, clock, tick, enable, service } = await fixtures(t);
  await enable();
  await tick();
  clock.time += 5 * MINUTE;
  await enable();
  assert.equal((await tick()).reason, 'saved', 'identical settings keep the observation');

  await write('app.txt', 'next\r\n');
  await tick();
  clock.time += 5 * MINUTE;
  await enable({ idleMinutes: 6 });
  assert.equal((await tick()).reason, 'waiting-for-idle', 'a configuration change resets the wait');
  clock.time += 5 * MINUTE;
  assert.equal((await tick()).reason, 'waiting-for-idle');
  clock.time += MINUTE;
  assert.equal((await tick()).reason, 'saved');

  await write('app.txt', 'third\r\n');
  await tick();
  clock.time += 6 * MINUTE;
  await service.dispatch({ action: 'settings', settings: { ...ENABLED, idleMinutes: 6, automaticEnabled: false } });
  assert.equal((await tick()).reason, 'disabled');
  await enable({ idleMinutes: 6 });
  assert.equal((await tick()).reason, 'waiting-for-idle', 're-enabling starts a fresh observation');

  clock.time += 6 * MINUTE;
  await enable({ idleMinutes: 6, excludedPaths: ['unrelated.txt'] });
  assert.equal((await tick()).reason, 'waiting-for-idle', 'changing exclusions also resets');
});

test('configured exclusions apply to automatic saves, survive deletions and keep their coverage meaning', async t => {
  const { service, repo, write, clock, state, tick, enable, vaultRoot } = await fixtures(t);
  await write('secret-notes.txt', 'private v1');
  await write('other.txt', 'other v1');
  await enable({ excludedPaths: ['secret-notes.txt', 'gone.txt'] });
  await tick();
  clock.time += 5 * MINUTE;
  const saved = await tick();
  assert.equal(saved.reason, 'saved');
  const coverage = saved.checkpoint.coverage;
  assert.deepEqual(coverage.included.map(file => file.path).sort(), ['app.txt', 'other.txt']);
  for (const name of ['secret-notes.txt', 'gone.txt']) {
    assert.deepEqual(coverage.excluded.filter(file => file.path === name), [{ path: name, reason: 'Excluded by your selection' }], name);
  }
  assert.match(saved.checkpoint.note, /2 configured exclusions/);

  await write('secret-notes.txt', 'private v2, edited after the save');
  clock.time += 5 * MINUTE;
  assert.equal((await tick()).reason, 'unchanged', 'edits to an excluded file neither wait nor save');
  await write('gone.txt', 'appears later');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.checkpoint.id });
  assert.deepEqual(comparison.changes, [], 'configured exclusions are treated as intentional when comparing');
  await fs.rm(path.join(repo, 'secret-notes.txt'));
  assert.equal((await tick()).reason, 'unchanged', 'deleting an excluded file is not a failure');

  await fs.rm(path.join(repo, 'other.txt'));
  assert.equal((await tick()).reason, 'waiting-for-idle');
  clock.time += 5 * MINUTE;
  const afterDelete = await tick();
  assert.equal(afterDelete.reason, 'saved', 'a deletion is captured by absence');
  assert.deepEqual(afterDelete.checkpoint.coverage.included.map(file => file.path), ['app.txt']);
  const recovered = path.join(path.dirname(vaultRoot), 'recovered-after-delete');
  await service.dispatch({ action: 'recover', checkpointId: afterDelete.checkpoint.id, destination: recovered });
  assert.deepEqual(await listFiles(recovered), ['app.txt']);

  await fs.rm(path.join(repo, 'app.txt'));
  await fs.rm(path.join(repo, 'gone.txt'));
  assert.deepEqual(await tick(), { checkpoint: null, reason: 'no-eligible-files' });
  assert.equal((await state()).checkpoints.length, 2, 'no checkpoint is faked for an empty selection');
});

test('automatic saves fail clearly for a missing source or an interrupted repair', async t => {
  const { service, repo, write, state, tick, enable } = await fixtures(t);
  await write('second.txt', 'original second');
  const saved = await service.dispatch({ action: 'create', label: 'Old version' });
  await enable();
  await write('app.txt', 'current app'); await write('second.txt', 'current second');
  const comparison = await service.dispatch({ action: 'compare', checkpointId: saved.id });
  const originalSave = service.saveCaptured.bind(service);
  service.saveCaptured = async (...args) => {
    const checkpoint = await originalSave(...args);
    await write('second.txt', 'concurrent edit');
    return checkpoint;
  };
  await assert.rejects(service.dispatch({ action: 'repair', checkpointId: saved.id, paths: ['app.txt', 'second.txt'], expectedFingerprint: comparison.currentFingerprint }), /Repair is incomplete/);
  service.saveCaptured = originalSave;
  const before = (await state()).checkpoints.length;
  await assert.rejects(tick(), /interrupted/);
  assert.equal((await state()).checkpoints.length, before, 'nothing is saved while a repair is pending');
  await write('second.txt', 'current second');
  await service.dispatch({ action: 'repairRollback' });

  await fs.rm(repo, { recursive: true, force: true });
  await assert.rejects(tick(), /Automatic save cannot read the source folder/);
  assert.equal((await state()).checkpoints.length, before);
});

// ---------- evidence ----------

test('manual evidence binds to one exact checkpoint, stays immutable and preserves other metadata', async t => {
  const { service, save, state, clock, root } = await fixtures(t);
  const first = await save('First');
  const second = await save('Second', 'different\r\n');
  await service.dispatch({ action: 'recover', checkpointId: first.id, destination: path.join(root, 'recovered') });
  clock.time += MINUTE;
  const passed = await service.dispatch({ action: 'evidence', checkpointId: first.id, description: '  Login page loads  ', outcome: 'passed' });
  clock.time += MINUTE;
  const failed = await service.dispatch({ action: 'evidence', checkpointId: first.id, description: 'Checkout crashes', outcome: 'failed' });
  assert.deepEqual({ ...passed, id: undefined }, { id: undefined, recordedAt: new Date(clock.time - MINUTE).toISOString(), kind: 'manual',
    description: 'Login page loads', outcome: 'passed', checkpointId: first.id });
  assert.notEqual(passed.id, failed.id);
  const current = await state();
  const stored = current.checkpoints.find(checkpoint => checkpoint.id === first.id);
  assert.deepEqual(stored.evidence, [passed, failed], 'evidence is appended in order');
  assert.ok(stored.recoveredAt, 'an earlier recovery receipt survives');
  assert.deepEqual(current.checkpoints.find(checkpoint => checkpoint.id === second.id).evidence, [], 'evidence never leaks to another version');
  assert.equal(stored.fingerprint, first.fingerprint);

  const missing = '00000000-0000-4000-8000-000000000000';
  const bad = [[{ checkpointId: missing, description: 'x', outcome: 'passed' }], [{ checkpointId: 'not-an-id', description: 'x', outcome: 'passed' }],
    [{ checkpointId: first.id, description: '   ', outcome: 'passed' }, /1–4000/], [{ checkpointId: first.id, description: 'x'.repeat(4001), outcome: 'passed' }, /1–4000/],
    [{ checkpointId: first.id, description: 'x', outcome: 'certified' }, /passed, failed or untested/]];
  for (const [request, message] of bad) await assert.rejects(service.dispatch({ action: 'evidence', ...request }), message);
  assert.equal((await state()).checkpoints.find(checkpoint => checkpoint.id === first.id).evidence.length, 2);
});

test('screenshots are copied into the vault, verified by type, and independent of the original', async t => {
  const { service, save, state, root } = await fixtures(t);
  const checkpoint = await save('With pictures');
  const shots = path.join(root, 'shots');
  await fs.mkdir(shots);
  const put = async (name, bytes) => { const file = path.join(shots, name); await fs.writeFile(file, bytes); return file; };
  const record = screenshotPath => service.dispatch({ action: 'evidence', checkpointId: checkpoint.id, description: 'Looks right', outcome: 'passed', screenshotPath });

  const original = await put('login.png', PNG);
  const entry = await record(original);
  assert.ok(entry.screenshotPath.startsWith(path.join(service.vaultPath, 'evidence', checkpoint.id)) && entry.screenshotPath.endsWith('.png'));
  assert.deepEqual(await fs.readFile(entry.screenshotPath), PNG);
  await fs.writeFile(original, 'replaced by later work');
  assert.deepEqual(await fs.readFile(entry.screenshotPath), PNG, 'changing the original does not change the evidence');
  await fs.rm(original);
  assert.deepEqual(await fs.readFile(entry.screenshotPath), PNG, 'deleting the original does not remove the evidence');
  const reopened = (await new RecoveryService(service.repoPath, { vaultRoot: path.join(root, 'vault') }).dispatch({ action: 'state' })).checkpoints[0].evidence[0];
  assert.equal(reopened.screenshotPath, entry.screenshotPath);
  const again = await record(await put('again.png', PNG));
  assert.notEqual(path.dirname(again.screenshotPath), path.dirname(entry.screenshotPath), 'each evidence entry has its own directory');

  assert.ok((await record(await put('photo.dat', JPEG))).screenshotPath.endsWith('.jpg'), 'the type comes from the bytes, not the name');
  assert.ok((await record(await put('modern.bin', WEBP))).screenshotPath.endsWith('.webp'));
  const count = (await state()).checkpoints[0].evidence.length;

  const rejected = [
    [await put('vector.png', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), /PNG, JPEG or WebP/],
    [await put('disguised.png', 'plain text pretending to be an image'), /PNG, JPEG or WebP/],
    [await put('program.png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)])), /PNG, JPEG or WebP/],
    [await put('empty.png', Buffer.alloc(0)), /between 1 byte and 10 MiB/],
    [await put('huge.png', Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)])), /between 1 byte and 10 MiB/],
    [shots, /regular file/], [path.join(shots, 'missing.png'), /ENOENT/], ['relative/shot.png', /absolute/],
  ];
  for (const [file, message] of rejected) await assert.rejects(record(file), message, file);
  try {
    await fs.symlink(path.join(shots, 'again.png'), path.join(shots, 'link.png'));
    await assert.rejects(record(path.join(shots, 'link.png')), /regular file/);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    t.diagnostic(`symlink rejection not exercised: ${error.code}`);
  }
  assert.equal((await state()).checkpoints[0].evidence.length, count, 'rejected screenshots record nothing');
  assert.deepEqual((await fs.readdir(path.join(service.vaultPath, 'evidence', checkpoint.id))).length, count, 'and leave no copies behind');
});

// ---------- explicit checks ----------

const checkFixture = async (t, options) => {
  const context = await fixtures(t, options);
  const { write, save } = context;
  await write('pass.js', "console.log('all good');\n");
  await write('fail.js', "console.error('boom'); process.exit(3);\n");
  await write('hang.js', "const { spawn } = require('node:child_process');\n"
    + "const child = spawn(process.execPath, ['-e', 'console.log(\"grandchild\"); setInterval(() => {}, 1000)'], { stdio: 'inherit' });\n"
    + "require('node:fs').writeFileSync('grandchild.pid', String(child.pid));\nconsole.log('started');\nsetInterval(() => {}, 1000);\n");
  await write('mutate.js', "require('node:fs').writeFileSync('pass.js', 'tampered');\n");
  await write('add.js', "require('node:fs').writeFileSync('new-source.txt', 'added');\n");
  await write('remove.js', "require('node:fs').rmSync('pass.js');\n");
  await write('generated.js', "const fs = require('node:fs'); fs.mkdirSync('dist'); fs.writeFileSync('dist/out.txt', 'x');"
    + " fs.mkdirSync('node_modules/dep', { recursive: true }); fs.writeFileSync('node_modules/dep/index.js', 'x');\n");
  const checkpoint = await save('Checkable');
  const check = async (command, extra = {}, checkpointId = checkpoint.id) => {
    const entry = await context.service.dispatch({ action: 'runCheck', checkpointId, command, ...extra });
    keepCopy(t, entry);
    return entry;
  };
  return { ...context, checkpoint, check };
};

test('a passing check records exact-version evidence and leaves source and history untouched', async t => {
  const { service, repo, check, checkpoint, state, save } = await checkFixture(t);
  const later = await save('Later', 'later\r\n');
  const before = await listFiles(repo), fingerprint = (await service.dispatch({ action: 'preview' })).fingerprint;
  const entry = await check('node pass.js');
  assert.equal(entry.outcome, 'passed');
  assert.equal(entry.exitCode, 0);
  assert.equal(entry.kind, 'command');
  assert.equal(entry.command, 'node pass.js');
  assert.equal(entry.checkpointId, checkpoint.id);
  assert.match(entry.output, /all good/);
  assert.match(entry.description, /only that command and checkpoint/);
  assert.ok(HOLDER.test(path.basename(path.dirname(entry.workingCopyPath))));
  assert.equal(await fs.readFile(path.join(entry.workingCopyPath, 'pass.js'), 'utf8'), "console.log('all good');\n", 'the retained copy is the checkpoint, not the current source');
  assert.equal(await fs.readFile(path.join(entry.workingCopyPath, 'app.txt'), 'utf8'), 'working\r\n');
  assert.deepEqual(await listFiles(repo), before);
  assert.equal((await service.dispatch({ action: 'preview' })).fingerprint, fingerprint);
  const current = await state();
  assert.deepEqual(current.checkpoints.find(item => item.id === checkpoint.id).evidence, [entry]);
  assert.deepEqual(current.checkpoints.find(item => item.id === later.id).evidence, []);
});

test('failing, unstartable and rejected checks are recorded or refused honestly', async t => {
  const { service, check, checkpoint, state } = await checkFixture(t);
  const failed = await check('node fail.js');
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.exitCode, 3);
  assert.match(failed.output, /boom/);
  const missing = await check('node does-not-exist.js');
  assert.equal(missing.outcome, 'failed');
  assert.notEqual(missing.exitCode, 0);
  assert.equal((await state()).checkpoints.find(item => item.id === checkpoint.id).evidence.length, 2, 'failures are kept as evidence');

  const bad = [[{ command: '   ' }, /1–4000/], [{ command: 'x'.repeat(4001) }, /1–4000/], [{ command: 7 }, /1–4000/],
    [{ command: 'node pass.js', timeoutSeconds: 0 }, /time limit/], [{ command: 'node pass.js', timeoutSeconds: 601 }, /time limit/],
    [{ command: 'node pass.js', timeoutSeconds: 1.5 }, /time limit/], [{ command: 'node pass.js', timeoutSeconds: '5' }, /time limit/]];
  for (const [request, message] of bad) await assert.rejects(service.dispatch({ action: 'runCheck', checkpointId: checkpoint.id, ...request }), message);
  await assert.rejects(service.dispatch({ action: 'runCheck', checkpointId: '00000000-0000-4000-8000-000000000000', command: 'node pass.js' }));
  assert.equal((await state()).checkpoints.find(item => item.id === checkpoint.id).evidence.length, 2, 'refused requests record nothing');
});

test('a check that exceeds its time limit is stopped with its whole process tree', async t => {
  const { check } = await checkFixture(t);
  const started = Date.now();
  const entry = await check('node hang.js', { timeoutSeconds: 3 });
  assert.ok(Date.now() - started < 9000, 'termination did not wait for the fallback deadline');
  assert.equal(entry.outcome, 'failed');
  assert.equal(entry.exitCode, null);
  assert.match(entry.description, /exceeded its 3 s limit and its process tree was stopped/);
  assert.match(entry.output, /started/);
  const pid = Number(await fs.readFile(path.join(entry.workingCopyPath, 'grandchild.pid'), 'utf8'));
  assert.ok(pid > 0);
  for (let attempt = 0; attempt < 40 && alive(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(alive(pid), false, 'the grandchild process is gone');
});

test('a check that changes saved code or adds source is recorded as untested even when it exits 0', async t => {
  const { check, checkpoint, state, service, root } = await checkFixture(t);
  const changed = await check('node mutate.js');
  assert.equal(changed.exitCode, 0);
  assert.equal(changed.outcome, 'untested');
  assert.match(changed.description, /pass\.js was changed/);
  assert.match(changed.description, /recorded as untested/);
  const added = await check('node add.js');
  assert.equal(added.outcome, 'untested');
  assert.match(added.description, /new-source\.txt was added/);
  const removed = await check('node remove.js');
  assert.equal(removed.outcome, 'untested');
  assert.match(removed.description, /pass\.js was removed/);
  const generated = await check('node generated.js');
  assert.equal(generated.outcome, 'passed', 'dependency and generated folders follow the normal exclusion policy');
  // The checkpoint itself is unchanged, so the next run starts from the same bytes.
  assert.equal((await check('node pass.js')).outcome, 'passed');
  assert.equal((await state()).checkpoints.find(item => item.id === checkpoint.id).evidence.length, 5);
  const recovered = path.join(root, 'verify-recovery');
  await service.dispatch({ action: 'recover', checkpointId: checkpoint.id, destination: recovered });
  assert.equal(await fs.readFile(path.join(recovered, 'pass.js'), 'utf8'), "console.log('all good');\n");
});

test('check evidence redacts credentials, withholds the service token and bounds output', async t => {
  const token = 'tok-secret-value-123456';
  const { write, save, service } = await fixtures(t, { githubToken: token });
  const saved = Object.entries({ GH_TOKEN: 'ghenv-value-abcdef', GITHUB_TOKEN: 'ghenv-value-ghijkl', BITGIT_TEST_LEAK: `carries ${token}` });
  const original = Object.fromEntries(saved.map(([key]) => [key, process.env[key]]));
  Object.assign(process.env, Object.fromEntries(saved));
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await write('env.js', "console.log('ENV:' + JSON.stringify(Object.entries(process.env).filter(([key, value]) => ['GH_TOKEN', 'GITHUB_TOKEN', 'BITGIT_TEST_LEAK'].includes(key) || String(value).includes('tok-secret'))));\n");
  await write('secrets.js', "console.log('ghp_' + 'A'.repeat(36));\nconsole.log('password=hunter2hunter2');\nconsole.log('https://user:pw123456@example.com/repo');\n"
    + "console.log('note tok-secret-value-123456 end');\nconsole.log('Authorization: Bearer abcdefghijklmnopqrstuvwxyz');\n");
  await write('flood.js', "console.log('x'.repeat(200000));\nconsole.log('FINAL-LINE');\n");
  const checkpoint = await save('Secrets');
  const run = async (command) => { const entry = await service.dispatch({ action: 'runCheck', checkpointId: checkpoint.id, command }); keepCopy(t, entry); return entry; };

  const environment = await run('node env.js');
  assert.match(environment.output, /^ENV:\[\]\s*$/, 'the service token and GitHub token variables are not passed to the command');

  const secrets = await run(`node secrets.js --token=${token}`);
  for (const leaked of ['ghp_AAAA', 'hunter2hunter2', 'pw123456', token, 'abcdefghijklmnopqrstuvwxyz']) {
    assert.ok(!secrets.output.includes(leaked) && !secrets.command.includes(leaked) && !secrets.description.includes(leaked), leaked);
  }
  assert.match(secrets.output, /\[REDACTED\]/);
  assert.match(secrets.command, /^node secrets\.js --token=\[REDACTED\]$/);
  assert.equal(secrets.outcome, 'passed');

  const flood = await run('node flood.js');
  assert.ok(Buffer.byteLength(flood.output) <= 32 * 1024);
  assert.match(flood.output, /FINAL-LINE\s*$/, 'the tail of the output is kept');
  assert.match(flood.description, /last 32 KiB/);
});

// ---------- regression sessions ----------

const historyFixture = async (t, count = 7) => {
  const context = await fixtures(t);
  const checkpoints = [];
  for (let index = 0; index < count; index++) checkpoints.push(await context.save(`Milestone ${index}`, `version ${index}\r\n`));
  return { ...context, ids: checkpoints.map(checkpoint => checkpoint.id) };
};

test('regression search bisects chronologically, persists across restarts and reports the first observed bad milestone', async t => {
  const { service, ids, vaultRoot, repo } = await historyFixture(t);
  const start = (good, bad) => service.dispatch({ action: 'regressionStart', goodId: good, badId: bad });
  const observe = (sessionId, checkpointId, outcome) => service.dispatch({ action: 'regressionObserve', sessionId, checkpointId, outcome });
  const session = await start(ids[0], ids[6]);
  assert.deepEqual(session.candidateIds, ids, 'candidates are the chronological interval, endpoints included');
  assert.deepEqual(session.observations, { [ids[0]]: 'good', [ids[6]]: 'bad' });
  assert.deepEqual({ next: session.nextId, first: session.firstBadId, inconclusive: session.inconclusiveIds, complete: session.complete },
    { next: ids[3], first: null, inconclusive: [], complete: false });
  const file = path.join(service.vaultPath, 'regressions', `${session.id}.json`);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).version, 1);

  const afterGood = await observe(session.id, ids[3], 'good');
  assert.equal(afterGood.nextId, ids[4]);
  const restarted = new RecoveryService(repo, { vaultRoot });
  assert.deepEqual(await restarted.dispatch({ action: 'regressionGet', sessionId: session.id }), afterGood, 'a new process resumes the same session');
  const done = await observe(session.id, ids[4], 'bad');
  assert.deepEqual({ complete: done.complete, first: done.firstBadId, next: done.nextId, inconclusive: done.inconclusiveIds }, { complete: true, first: ids[4], next: null, inconclusive: [] });
  assert.deepEqual(await restarted.dispatch({ action: 'regressionGet', sessionId: session.id }), done);

  const adjacent = await start(ids[2], ids[3]);
  assert.deepEqual({ complete: adjacent.complete, first: adjacent.firstBadId, next: adjacent.nextId }, { complete: true, first: ids[3], next: null });
  const partial = await start(ids[1], ids[5]);
  assert.deepEqual(partial.candidateIds, ids.slice(1, 6), 'only the requested inclusive range is searched');
});

test('skipped milestones are never suggested again and make the boundary uncertain', async t => {
  const { service, ids } = await historyFixture(t);
  const observe = (sessionId, checkpointId, outcome) => service.dispatch({ action: 'regressionObserve', sessionId, checkpointId, outcome });
  const session = await service.dispatch({ action: 'regressionStart', goodId: ids[0], badId: ids[6] });
  let current = await observe(session.id, ids[3], 'skip');
  assert.equal(current.nextId, ids[2], 'the midpoint moves to the nearest balanced untested milestone');
  assert.deepEqual(current.inconclusiveIds, [ids[3]]);
  assert.equal(current.complete, false);
  current = await observe(session.id, ids[2], 'good');
  assert.equal(current.nextId, ids[4]);
  current = await observe(session.id, ids[4], 'bad');
  assert.deepEqual({ complete: current.complete, first: current.firstBadId, next: current.nextId, inconclusive: current.inconclusiveIds },
    { complete: true, first: ids[4], next: null, inconclusive: [ids[3]] }, 'the skipped milestone between last good and first bad stays inconclusive');

  const allSkipped = await service.dispatch({ action: 'regressionStart', goodId: ids[0], badId: ids[3] });
  await observe(allSkipped.id, ids[1], 'skip');
  const finished = await observe(allSkipped.id, ids[2], 'skip');
  assert.deepEqual({ complete: finished.complete, first: finished.firstBadId, inconclusive: finished.inconclusiveIds }, { complete: true, first: ids[3], inconclusive: [ids[1], ids[2]] });
});

test('regression rejects contradictions, overwrites, foreign milestones and invalid sessions without changing state', async t => {
  const { service, ids, save } = await historyFixture(t);
  const start = (goodId, badId) => service.dispatch({ action: 'regressionStart', goodId, badId });
  const observe = (sessionId, checkpointId, outcome) => service.dispatch({ action: 'regressionObserve', sessionId, checkpointId, outcome });
  const get = sessionId => service.dispatch({ action: 'regressionGet', sessionId });
  await assert.rejects(start(ids[4], ids[2]), /good milestone must have been saved before/);
  await assert.rejects(start(ids[2], ids[2]), /two different milestones/);
  await assert.rejects(start('not-an-id', ids[2]), /Invalid checkpoint ID/);
  await assert.rejects(start(ids[0], '00000000-0000-4000-8000-000000000000'));

  const session = await start(ids[0], ids[6]);
  await observe(session.id, ids[3], 'bad');
  const good = await observe(session.id, ids[2], 'good');
  await assert.rejects(observe(session.id, ids[4], 'good'), /contradicts an earlier bad/);
  await assert.rejects(observe(session.id, ids[1], 'bad'), /contradicts an earlier good/);
  await assert.rejects(observe(session.id, ids[3], 'good'), /already recorded as bad/);
  await assert.rejects(observe(session.id, ids[0], 'bad'), /already recorded as good/);
  assert.deepEqual(await observe(session.id, ids[3], 'bad'), good, 'repeating the same observation is idempotent');
  assert.deepEqual(await get(session.id), good, 'rejected observations changed nothing');
  await assert.rejects(observe(session.id, ids[2], 'maybe'), /good, bad or skip/);

  const outsider = await save('Saved after the session started', 'outsider\r\n');
  await assert.rejects(observe(session.id, outsider.id, 'good'), /outside this regression session/);
  await assert.rejects(get('00000000-0000-4000-8000-000000000000'), /not found/);
  await assert.rejects(get('../settings'), /Invalid regression session ID/);
  await assert.rejects(get(undefined), /Invalid regression session ID/);

  const file = path.join(service.vaultPath, 'regressions', `${session.id}.json`);
  const stored = JSON.parse(await fs.readFile(file, 'utf8'));
  const tampered = [{ ...stored, observations: { ...stored.observations, [outsider.id]: 'good' } }, { ...stored, version: 2 },
    { ...stored, observations: { ...stored.observations, [ids[5]]: 'good' } }, { ...stored, candidateIds: [...stored.candidateIds, stored.candidateIds[0]] },
    { ...stored, id: '11111111-1111-4111-8111-111111111111' }];
  for (const value of tampered) {
    await fs.writeFile(file, JSON.stringify(value));
    await assert.rejects(get(session.id), /Regression session file is invalid/);
  }
  await fs.writeFile(file, 'not json');
  await assert.rejects(get(session.id), /regression|metadata/i);
});

// ---------- harness CLI ----------

const cliPath = fileURLToPath(new URL('../dist/recovery-cli.js', import.meta.url));
const runCli = (args, input) => spawnSync(process.execPath, [cliPath, ...args], { input, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
const reply = result => {
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `exactly one stdout line, got: ${result.stdout}`);
  return JSON.parse(lines[0]);
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('the CLI dispatches real requests across separate processes with one JSON line each', async t => {
  const { repo, vaultRoot, write, service } = await fixtures(t);
  const args = ['--repo', repo, '--vault-root', vaultRoot];
  const send = request => runCli(args, JSON.stringify(request));

  const created = send({ action: 'create', label: 'From the harness', note: 'before refactor' });
  assert.equal(created.status, 0);
  assert.equal(created.stderr, '');
  const first = reply(created);
  assert.equal(first.success, true);
  assert.equal(first.data.label, 'From the harness');
  assert.equal(first.data.kind, 'manual');
  const listed = reply(send({ action: 'state' }));
  assert.deepEqual(listed.data.checkpoints.map(checkpoint => checkpoint.id), [first.data.id]);
  assert.deepEqual((await service.dispatch({ action: 'state' })).checkpoints.map(checkpoint => checkpoint.id), [first.data.id], 'the app and the CLI share one vault');

  assert.equal(reply(send({ action: 'settings', settings: ENABLED })).data.automaticEnabled, true);
  assert.deepEqual(reply(send({ action: 'autoTick' })).data, { checkpoint: null, reason: 'waiting-for-idle' });

  await pause(60); await write('app.txt', 'second\r\n');
  const second = reply(send({ action: 'create', label: 'Second' })).data;
  await pause(60); await write('app.txt', 'third\r\n');
  const third = reply(send({ action: 'create', label: 'Third' })).data;
  const session = reply(send({ action: 'regressionStart', goodId: first.data.id, badId: third.id })).data;
  assert.deepEqual(session.candidateIds, [first.data.id, second.id, third.id]);
  assert.equal(session.nextId, second.id);
  const observed = reply(send({ action: 'regressionObserve', sessionId: session.id, checkpointId: second.id, outcome: 'bad' })).data;
  assert.deepEqual({ complete: observed.complete, first: observed.firstBadId }, { complete: true, first: second.id });
  assert.deepEqual(reply(send({ action: 'regressionGet', sessionId: session.id })).data, observed);

  await write('ok.js', "console.log('cli ok');\n");
  const withScript = reply(send({ action: 'create', label: 'With script' })).data;
  const check = reply(send({ action: 'runCheck', checkpointId: withScript.id, command: 'node ok.js', timeoutSeconds: 60 }));
  assert.equal(check.success, true);
  keepCopy(t, check.data);
  assert.equal(check.data.outcome, 'passed');
  assert.match(check.data.output, /cli ok/);
});

test('the CLI fails with a JSON error and a nonzero exit for bad input, and never mutates by default', async t => {
  const { repo, vaultRoot } = await fixtures(t);
  const args = ['--repo', repo, '--vault-root', vaultRoot];
  const failure = (result, code, message) => {
    assert.equal(result.status, code, result.stdout);
    const body = reply(result);
    assert.equal(body.success, false);
    assert.match(body.error, message);
    assert.equal(result.stderr, '');
  };
  failure(runCli(args, '{not json'), 2, /not valid JSON/);
  failure(runCli(args, ''), 2, /No request received/);
  failure(runCli(args, '   \n'), 2, /No request received/);
  failure(runCli(args, '[]'), 2, /JSON object/);
  failure(runCli(args, '{"label":"no action"}'), 2, /Unknown or missing action/);
  failure(runCli(args, '{"action":"deleteEverything"}'), 2, /Unknown or missing action/);
  failure(runCli(args, '{"action":"toString"}'), 2, /Unknown or missing action/);
  failure(runCli(args, ' '.repeat(1024 * 1024 + 1)), 2, /1 MiB/);
  failure(runCli(['--vault-root', vaultRoot], '{"action":"state"}'), 2, /--repo/);
  failure(runCli(['--repo', 'relative/path'], '{"action":"state"}'), 2, /absolute/);
  failure(runCli([...args, '--token', 'abc'], '{"action":"state"}'), 2, /Unknown argument/);
  failure(runCli([...args, '--repo', repo], '{"action":"state"}'), 2, /more than once/);
  assert.equal(await fs.stat(vaultRoot).then(() => true, () => false), false, 'rejected input creates no vault');
  failure(runCli(args, '{"action":"compare","checkpointId":"00000000-0000-4000-8000-000000000000"}'), 1, /./);
  failure(runCli(args, '{"action":"create","label":""}'), 1, /Name the milestone/);

  const BOM = '\uFEFF';
  assert.equal(reply(runCli(args, `${BOM}{"action":"preview"}`)).success, true, 'a BOM from a shell redirect is tolerated');
  const help = runCli(['--help'], '');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /stdin/);
  assert.match(help.stdout, /runCheck/);
  assert.match(help.stdout, /--vault-root/);
});

test('CLI argument and request parsers are strict', () => {
  assert.deepEqual(parseCliArgs(['--repo', path.resolve('x'), '--vault-root', path.resolve('v')]), { help: false, repo: path.resolve('x'), vaultRoot: path.resolve('v') });
  assert.equal(parseCliArgs(['-h']).help, true);
  assert.throws(() => parseCliArgs(['--repo']), /absolute path/);
  assert.throws(() => parseCliArgs(['--repo=C:/x']), /Unknown argument/);
  assert.deepEqual(parseCliRequest('\uFEFF {"action":"autoTick"} '), { action: 'autoTick' });
  assert.throws(() => parseCliRequest('null'), /JSON object/);
});
