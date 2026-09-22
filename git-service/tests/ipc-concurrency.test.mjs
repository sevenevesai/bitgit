// Run after `npm --prefix git-service run build`: node --test git-service/tests/ipc-concurrency.test.mjs
// Drives the real IPC process. A post-checkout hook holds one command open until the test releases it,
// so ordering is asserted without timing assumptions.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chmodSync, writeFileSync } from 'node:fs';
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

// A repository whose next checkout blocks until `release()` is called.
function heldRepository(name) {
  const { work } = fx.seedProject(sandbox, name);
  fx.git(work, 'branch', 'other');
  const gate = `${sandbox.dir(`${name}-gate`)}`.replace(/\\/g, '/');
  const hook = join(work, '.git', 'hooks', 'post-checkout');
  writeFileSync(hook, `#!/bin/sh\nwhile [ ! -f "${gate}" ]; do sleep 0.1; done\n`);
  chmodSync(hook, 0o755);
  return { work, release: () => writeFileSync(gate, '') };
}

test('a held repository delays only its own later commands', async t => {
  const call = await ipcSession(t);
  const held = heldRepository('held');
  const { work: free } = fx.seedProject(sandbox, 'free');
  const order = [];
  const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

  const checkout = call('switchBranch', { repoPath: held.work, branchName: 'other' }).then(r => { order.push('checkout'); return r; });
  // Same repository under a different spelling: it must still queue behind the checkout.
  const behind = call('getCurrentBranch', { repoPath: held.work.toUpperCase() + '\\' }).then(r => { order.push('behind'); return r; });

  const other = await call('getFileChanges', { repoPath: free });
  assert.equal(other.success, true);
  const snapshots = await call('getAnalyticsSnapshots', {
    repoPaths: [held.work], params: { historySince: day(-90), recentSince: day(-30), recentLimit: 30 },
  });
  assert.equal(snapshots.success, true);
  assert.equal((await call('ping', {})).data, 'pong');
  assert.deepEqual(order, [], 'nothing in the held repository may finish before its checkout does');

  held.release();
  assert.equal((await checkout).success, true);
  const current = await behind;
  assert.deepEqual(order, ['checkout', 'behind']);
  assert.equal(current.data, 'other', 'the queued read must observe the finished checkout');
});

test('a failing command does not block the ones queued behind it', async t => {
  const call = await ipcSession(t);
  const { work } = fx.seedProject(sandbox, 'failing');

  const [failed, next] = await Promise.all([
    call('switchBranch', { repoPath: work, branchName: 'no-such-branch' }),
    call('getCurrentBranch', { repoPath: work }),
  ]);

  assert.equal(failed.success, false);
  assert.deepEqual([next.success, next.data], [true, 'trunk']);
});
