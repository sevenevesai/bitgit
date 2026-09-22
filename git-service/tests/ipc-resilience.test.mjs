// Run after `npm --prefix git-service run build`: node --test git-service/tests/ipc-resilience.test.mjs
// Drives the real IPC process. A preload rejects a promise outside any request once the test creates a
// trigger file, which it does only after the service has reported startup.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as fx from './git-reliability-fixtures.mjs';

const sandbox = fx.createSandbox();
after(() => sandbox.dispose());

test('a stray promise rejection is reported redacted and the service keeps answering', { timeout: 30000 }, async () => {
  const trigger = sandbox.dir('trigger');
  const preload = sandbox.dir('stray-rejection.cjs');
  writeFileSync(preload, [
    "const { existsSync } = require('node:fs');",
    `const poll = setInterval(() => {`,
    `  if (!existsSync(${JSON.stringify(trigger)})) return;`,
    '  clearInterval(poll);',
    "  Promise.reject(new Error('https://user:secret@example.invalid/x stray'));",
    '}, 20);',
    'poll.unref();',
    '',
  ].join('\n'));

  const child = spawn(process.execPath, ['--require', preload, fileURLToPath(new URL('../dist/index.js', import.meta.url))], {
    env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  // A dead service fails the test through `exited` below; the write error adds nothing.
  child.stdin.on('error', () => {});
  const exited = new Promise(resolve => child.once('exit', resolve));
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  const stderrIncludes = (text) => new Promise(resolve => {
    const check = () => { if (stderr.includes(text)) { child.stderr.off('data', check); resolve(); } };
    child.stderr.on('data', check);
    check();
  });
  child.stderr.on('data', chunk => { stderr += chunk; });

  try {
    await stderrIncludes('IPC server started');
    writeFileSync(trigger, '');
    await stderrIncludes('stray');

    const pong = new Promise(resolve => lines.on('line', line => resolve(JSON.parse(line))));
    child.stdin.write(JSON.stringify({ id: '1', type: 'ping', payload: {} }) + '\n');
    const response = await Promise.race([pong, exited.then(code => { throw new Error(`service exited with ${code}`); })]);

    assert.equal(response.data, 'pong');
    assert.match(stderr, /unhandled rejection/i);
    assert.doesNotMatch(stderr, /secret/);
  } finally {
    lines.close();
    child.stdin.end();
    await exited;
  }
});
