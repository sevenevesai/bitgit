import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fx from './git-reliability-fixtures.mjs';

const sandbox = fx.createSandbox();
after(() => sandbox.dispose());

async function ipcSession(t) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/index.js', import.meta.url))], {
    env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const waiting = new Map();
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  lines.on('line', line => { const result = JSON.parse(line); waiting.get(result.id)?.(result); waiting.delete(result.id); });
  let next = 0;
  t.after(async () => { lines.close(); child.stdin.end(); await new Promise(resolve => child.once('close', resolve)); });
  return (type, payload) => new Promise((resolve, reject) => {
    const id = String(++next);
    const timeout = setTimeout(() => { waiting.delete(id); child.kill(); reject(new Error(`IPC ${type} timed out`)); }, 30000);
    waiting.set(id, result => { clearTimeout(timeout); resolve(result); });
    child.stdin.write(JSON.stringify({ id, type, payload }) + '\n');
  });
}

test('real IPC preserves selection, diff scope, validation and confirmed push results', async t => {
  const call = await ipcSession(t);
  const { work, remote } = fx.seedProject(sandbox, 'ipc');
  fx.write(work, 'selected.txt', 'chosen\n');
  fx.write(work, 'other.txt', 'staged elsewhere\n');
  fx.write(work, '.env', 'TOKEN=fixture-only');
  fx.git(work, 'add', 'other.txt');
  const changes = await call('getFileChanges', { repoPath: work });
  assert.equal(changes.success, true);
  assert.equal(changes.data.find(file => file.path === 'other.txt').staged, 'added');
  assert.equal(changes.data.find(file => file.path === 'selected.txt').untracked, true);
  const diff = await call('getDiff', { repoPath: work, filePath: 'selected.txt', scope: 'untracked' });
  assert.equal(diff.success, true);
  assert.equal(diff.data[0].scope, 'untracked');
  assert.ok(diff.data[0].changes.some(line => line.content.includes('chosen')));
  const refused = await call('validateBeforeSync', { repoPath: work, selectedFiles: ['.env'] });
  assert.equal(refused.data.canProceed, false);
  const noSelection = await call('pushLocal', { repoPath: work });
  assert.equal(noSelection.success, false);
  const pushed = await call('pushLocal', { repoPath: work, selectedFiles: ['selected.txt'], commitMessage: 'Selected via IPC' });
  assert.equal(pushed.success, true, pushed.error);
  assert.equal(pushed.data.pushed, true);
  assert.equal(pushed.data.committed, 1);
  assert.equal(fx.git(remote, 'show', 'trunk:selected.txt'), 'chosen');
  assert.equal(fx.git(work, 'diff', '--cached', '--name-only'), 'other.txt');
  assert.equal(readFileSync(join(work, '.env'), 'utf8'), 'TOKEN=fixture-only');
});

test('explicit initialization leaves all code uncommitted and a reviewed first commit works', async t => {
  const call = await ipcSession(t);
  const work = sandbox.dir('plain');
  const remote = fx.newBareRemote(sandbox, 'first');
  fx.write(work, 'app.js', 'code\n');
  fx.write(work, '.env', 'TOKEN=fixture-only');
  const read = await call('getBranches', { repoPath: work });
  assert.equal(read.success, false);
  assert.equal(existsSync(join(work, '.git')), false);
  const initialized = await call('initRepository', { localPath: work });
  assert.equal(initialized.success, true, initialized.error);
  assert.notEqual(fx.gitResult(work, ['rev-parse', '--verify', 'HEAD']).status, 0);
  assert.equal(fx.git(work, 'ls-files'), '');
  const published = await call('pushLocal', { repoPath: work, remoteUrl: remote, selectedFiles: ['app.js'], commitMessage: 'Reviewed first commit' });
  assert.equal(published.success, true, published.error);
  assert.equal(fx.git(remote, 'show', 'main:app.js'), 'code');
  assert.notEqual(fx.gitResult(remote, ['show', 'main:.env']).status, 0);
  assert.equal(readFileSync(join(work, '.env'), 'utf8'), 'TOKEN=fixture-only');
  const mismatch = await call('addRemote', { localPath: work, remoteName: 'origin', remoteUrl: sandbox.dir('different.git') });
  assert.equal(mismatch.success, false);
  assert.equal(fx.git(work, 'remote', 'get-url', 'origin').replaceAll('\\', '/'), remote.replaceAll('\\', '/'));
});
