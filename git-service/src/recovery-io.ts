import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
export const exists = async (file: string): Promise<boolean> => {
  try { await fs.lstat(file); return true; } catch (error: any) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

export function safeRelative(file: string): string {
  const parts = file.split('/');
  if (!file || path.isAbsolute(file) || parts.some(part => !part || part === '.' || part === '..'
    || /^(?:\.git|git~[0-9]+)$/i.test(part) || /[\\\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsupported or unsafe file path: ${file}`);
  }
  return file;
}

export function within(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

export async function assertNoLinks(root: string, target: string): Promise<void> {
  if (!within(root, target)) throw new Error('Path escapes its expected directory');
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Linked paths are outside recovery coverage: ${current}`);
  }
}

export async function atomicJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch (error: any) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read recovery metadata: ${path.basename(file)}`);
  }
}

export interface GitRunOptions { input?: Buffer | string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBytes?: number; }
export function gitRun(cwd: string, args: string[], options: GitRunOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // An inherited GIT_DIR/INDEX_FILE could redirect a harness call into another repository.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const child = spawn('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', ...args], {
      cwd, windowsHide: true, env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let size = 0, exceeded = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > (options.maxBytes ?? 300 * 1024 * 1024)) { exceeded = true; child.kill(); }
      else stdout.push(chunk);
    });
    let errorSize = 0;
    child.stderr.on('data', (chunk: Buffer) => { if ((errorSize += chunk.length) <= 16_384) stderr.push(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('Git operation timed out; its result was not verified'));
      else if (exceeded) reject(new Error('Git output exceeds recovery limits'));
      else if (code !== 0) reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `Git exited with ${code}`));
      else resolve(Buffer.concat(stdout));
    });
    child.stdin.on('error', () => { /* Exit status reports rejected stdin. */ });
    child.stdin.end(options.input);
  });
}

const queues = new Map<string, Promise<unknown>>();
export async function withVaultLock<T>(vault: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(vault) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    await fs.mkdir(vault, { recursive: true });
    const lock = path.join(vault, 'operation.lock');
    const token = randomUUID();
    let handle;
    try { handle = await fs.open(lock, 'wx', 0o600); } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      const reclaimerPath = `${lock}.reclaim`;
      let reclaimer;
      try { reclaimer = await fs.open(reclaimerPath, 'wx', 0o600); } catch {
        throw new Error('Another recovery operation is checking its lock. Retry shortly.');
      }
      try {
        // Re-read under a separate exclusive guard: two stale-lock readers must not steal
        // the replacement lock from the process that won reclamation.
        const owner = await readJson<{ pid?: number; token?: string }>(lock, {});
        let alive = true;
        if (Number.isInteger(owner.pid) && owner.pid! > 0) {
          try { process.kill(owner.pid!, 0); } catch (probe: any) { if (probe.code === 'ESRCH') alive = false; }
        }
        if (alive) throw new Error('Another recovery operation is active. Retry when it finishes.');
        await fs.rm(lock);
        handle = await fs.open(lock, 'wx', 0o600);
      } finally { await reclaimer.close(); await fs.rm(reclaimerPath, { force: true }); }
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.close();
      return await operation();
    } finally {
      await handle.close().catch(() => {});
      const owner = await readJson<{ token?: string }>(lock, {});
      if (owner.token === token) await fs.rm(lock, { force: true });
    }
  });
  queues.set(vault, next);
  try { return await next; } finally { if (queues.get(vault) === next) queues.delete(vault); }
}
