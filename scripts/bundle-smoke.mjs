// Starts a bundled Git service the way the app does (node <script>, JSON lines on stdin and stdout)
// and expects a pong for a ping, so a bundle that cannot load its own dependencies fails the build.
// Usage: node scripts/bundle-smoke.mjs <git-service/dist/index.js inside the bundle>
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const script = process.argv[2];
if (!script || !existsSync(script)) {
  console.error(`Bundled service script not found: ${script ?? '(no path given)'}`);
  process.exit(1);
}

const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
let answered = false;
const fail = message => { console.error(message); process.exitCode = 1; child.kill(); };
const timer = setTimeout(() => fail('The bundled service did not answer within 30 s'), 30_000);

child.on('error', error => { clearTimeout(timer); fail(`Could not start Node: ${error.message}`); });
child.on('exit', code => {
  clearTimeout(timer);
  if (process.exitCode) return; // Already reported; the kill caused this exit.
  if (!answered) fail(`The bundled service exited (${code}) before answering`);
  else if (code !== 0) fail(`The bundled service exited with ${code} after answering`);
});
createInterface({ input: child.stdout }).once('line', line => {
  answered = true;
  let reply;
  try { reply = JSON.parse(line); } catch { reply = null; }
  if (reply?.id !== 'smoke' || reply.success !== true || reply.data !== 'pong') return fail(`Unexpected reply: ${line}`);
  console.log(`pong from ${script}`);
  child.stdin.end(); // The service exits when its input closes.
});
child.stdin.write(JSON.stringify({ id: 'smoke', type: 'ping', payload: {} }) + '\n');
