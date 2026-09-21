import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertNoLinks, sha256 } from './recovery-io.js';
import { captureSource } from './recovery-capture.js';
import { WINDOWS_CHECK_SCRIPT } from './recovery-windows-check.js';
import type { RecoveryService } from './recovery-service.js';
import type { CheckpointEvidence, RecoveryRequest } from './recovery-types.js';

const MAX_DESCRIPTION = 4000;
const MAX_COMMAND = 4000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_EVIDENCE_PER_CHECKPOINT = 500;
const OUTPUT_LIMIT = 32 * 1024;
// Redaction runs on the retained raw tail, so a credential split by the 32 KiB cut is still whole here.
const RAW_OUTPUT_LIMIT = 1024 * 1024;
const PIPE_GRACE_MS = 3000;
const KILL_WAIT_MS = 10_000;
const DEFAULT_TIMEOUT_SECONDS = 120;
const OUTCOMES = ['passed', 'failed', 'untested'];
const REDACTED = '[REDACTED]';
const SECRET_PATTERNS: Array<[RegExp, (match: string, ...groups: string[]) => string]> = [
  [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]+ )?PRIVATE KEY-----|$)/g, () => REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, () => REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/g, () => REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, () => REDACTED],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, () => REDACTED],
  [/\bnpm_[A-Za-z0-9]{30,}\b/g, () => REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, () => REDACTED],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{16,}/gi, (_match, scheme) => `${scheme} ${REDACTED}`],
  [/(:\/\/)[^\s\/@:]+:[^\s\/@]+@/g, (_match, scheme) => `${scheme}${REDACTED}@`],
  [/((?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|token|secret)\s*[:=]\s*)(["']?)[^\s"']{8,}\2/gi,
    (_match, prefix, quote) => `${prefix}${quote}${REDACTED}${quote}`],
];
const REDIRECTING_GIT_VARIABLES = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|PREFIX)$/i;

function redact(text: string, service: RecoveryService): string {
  const token = service.options.githubToken;
  let result = token && token.length >= 4 ? text.split(token).join(REDACTED) : text;
  for (const [pattern, replacement] of SECRET_PATTERNS) result = result.replace(pattern, replacement);
  return result;
}

async function appendEvidence(service: RecoveryService, checkpointId: string, entry: CheckpointEvidence): Promise<void> {
  const current = (await service.readCheckpoint(checkpointId)).evidence;
  if (current.length >= MAX_EVIDENCE_PER_CHECKPOINT) throw new Error(`This milestone already has ${MAX_EVIDENCE_PER_CHECKPOINT} evidence entries`);
  await service.updateMetadata(checkpointId, { evidence: [...current, entry] });
}

function imageExtension(bytes: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function copyScreenshot(service: RecoveryService, checkpointId: string, evidenceId: string, source: unknown): Promise<string> {
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error('Choose the screenshot using its absolute file path');
  const file = path.resolve(source);
  await assertNoLinks(path.parse(file).root, path.dirname(file));
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('The screenshot must be a regular file, not a link or folder');
  if (stat.size === 0 || stat.size > MAX_SCREENSHOT_BYTES) throw new Error('Screenshots must be between 1 byte and 10 MiB');
  const handle = await fs.open(file, 'r');
  let bytes: Buffer;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== stat.size || opened.ino !== stat.ino) throw new Error('The screenshot changed while it was being read');
    bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('The screenshot changed while it was being read');
  } finally { await handle.close(); }
  const extension = imageExtension(bytes);
  if (!extension) throw new Error('Screenshots must be PNG, JPEG or WebP images');
  const directory = path.join(service.vaultPath, 'evidence', checkpointId, evidenceId);
  const destination = path.join(directory, `screenshot.${extension}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    if (sha256(await fs.readFile(destination)) !== sha256(bytes)) throw new Error('The saved screenshot could not be verified');
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  return destination;
}

const boundedText = (value: unknown, label: string, limit: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) throw new Error(`${label} must contain 1–${limit} characters`);
  return value.trim();
};

export async function recordEvidence(service: RecoveryService, request: Extract<RecoveryRequest, { action: 'evidence' }>): Promise<CheckpointEvidence> {
  await service.readMetadata(request.checkpointId);
  const checkpoint = await service.readCheckpoint(request.checkpointId);
  const description = boundedText(request.description, 'The observation', MAX_DESCRIPTION);
  if (!OUTCOMES.includes(request.outcome)) throw new Error('Mark the observation passed, failed or untested');
  const id = randomUUID();
  const screenshotPath = request.screenshotPath === undefined ? undefined : await copyScreenshot(service, checkpoint.id, id, request.screenshotPath);
  const entry: CheckpointEvidence = { id, recordedAt: service.now(), kind: 'manual', description, outcome: request.outcome, checkpointId: checkpoint.id,
    ...(screenshotPath ? { screenshotPath } : {}) };
  try { await appendEvidence(service, checkpoint.id, entry); } catch (error) {
    if (screenshotPath) await fs.rm(path.dirname(screenshotPath), { recursive: true, force: true });
    throw error;
  }
  return entry;
}

interface ShellResult { exitCode: number | null; signal: string | null; timedOut: boolean; stopped: boolean; background: boolean; error?: string; output: Buffer; truncated: boolean; }

export async function readEvidenceImage(service: RecoveryService, checkpointId: string, evidenceId: string): Promise<{ dataUrl: string }> {
  const checkpoint = await service.readCheckpoint(checkpointId);
  if (typeof evidenceId !== 'string' || !/^[0-9a-f-]{36}$/.test(evidenceId)) throw new Error('Invalid evidence ID');
  const entry = checkpoint.evidence.find(item => item.id === evidenceId);
  if (!entry?.screenshotPath) throw new Error('This observation has no screenshot');
  const expectedDirectory = path.join(service.vaultPath, 'evidence', checkpoint.id, evidenceId);
  const file = path.resolve(entry.screenshotPath);
  if (path.dirname(file) !== expectedDirectory || !/^screenshot\.(png|jpg|webp)$/.test(path.basename(file))) throw new Error('Invalid saved screenshot path');
  await assertNoLinks(service.vaultPath, file);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > MAX_SCREENSHOT_BYTES) throw new Error('Invalid saved screenshot');
  const bytes = await fs.readFile(file);
  const extension = imageExtension(bytes);
  if (!extension || bytes.length > MAX_SCREENSHOT_BYTES) throw new Error('Invalid saved screenshot');
  return { dataUrl: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}` };
}

function killTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) return Promise.resolve();
  if (process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } // Group already gone: fall back to the leader.
    return Promise.resolve();
  }
  return new Promise(resolve => {
    // /T covers descendants of this exact child only; no name-based or global kill.
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { child.kill(); resolve(); });
    killer.on('close', () => resolve());
  });
}

function runShell(command: string, cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv, args?: string[]): Promise<ShellResult> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [], timers: NodeJS.Timeout[] = [];
    let kept = 0, truncated = false, timedOut = false, settled = false, background = false, spawnError: string | undefined;
    const child = spawn(command, args ?? [], { cwd, env, shell: !args, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (chunk: Buffer) => {
      chunks.push(chunk); kept += chunk.length;
      while (chunks.length > 1 && kept - chunks[0].length >= RAW_OUTPUT_LIMIT) { kept -= chunks.shift()!.length; truncated = true; }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const finish = (exitCode: number | null, signal: string | null, stopped: boolean) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      resolve({ exitCode, signal, timedOut, stopped, background, error: spawnError, output: Buffer.concat(chunks), truncated });
    };
    timers.push(setTimeout(() => {
      timedOut = true;
      void killTree(child).then(() => { if (!settled) timers.push(setTimeout(() => finish(null, null, false), KILL_WAIT_MS)); });
    }, timeoutMs));
    child.on('error', error => { spawnError = error.message; finish(null, null, true); });
    child.on('exit', () => {
      if (process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, 0); background = true; void killTree(child); } catch { /* group is gone */ }
      }
      if (!settled) timers.push(setTimeout(() => { background = true; child.stdout.destroy(); child.stderr.destroy(); }, PIPE_GRACE_MS));
    });
    child.on('close', (code, signal) => finish(timedOut ? null : code, signal, true));
  });
}

async function runManagedCheck(command: string, cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<ShellResult> {
  if (process.platform !== 'win32') return runShell(command, cwd, timeoutMs, env);
  const holder = path.dirname(cwd);
  const helper = path.join(holder, 'supervise.ps1'), report = path.join(holder, 'process-result.json');
  await fs.writeFile(helper, WINDOWS_CHECK_SCRIPT, { flag: 'wx' });
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = await runShell(powershell, cwd, timeoutMs + 20_000,
    { ...env, BITGIT_CHECK_COMMAND_BASE64: Buffer.from(command).toString('base64') },
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ResultPath', report, '-TimeoutMs', String(timeoutMs)]);
  try {
    const metadata = JSON.parse(await fs.readFile(report, 'utf8'));
    if (typeof metadata.timedOut !== 'boolean' || typeof metadata.stopped !== 'boolean' || typeof metadata.background !== 'boolean'
      || (metadata.exitCode !== null && !Number.isInteger(metadata.exitCode))) throw new Error('Invalid process result');
    return { ...result, ...metadata };
  } catch {
    return { ...result, stopped: false, error: result.error || 'The check supervisor did not confirm its result' };
  }
}

function checkEnvironment(service: RecoveryService): NodeJS.ProcessEnv {
  const token = service.options.githubToken;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || REDIRECTING_GIT_VARIABLES.test(key) || /^(?:GITHUB|GH)_(?:TOKEN|PAT)$/i.test(key) || (token && value.includes(token))) continue;
    env[key] = value;
  }
  return env;
}

function boundedOutput(result: ShellResult, service: RecoveryService): { text: string; truncated: boolean } {
  const raw = result.output;
  let start = 0;
  while (result.truncated && start < raw.length && (raw[start] & 0xc0) === 0x80) start++; // Drop a split UTF-8 sequence.
  const bytes = Buffer.from(redact(raw.subarray(start).toString('utf8'), service), 'utf8');
  if (bytes.length <= OUTPUT_LIMIT) return { text: bytes.toString('utf8'), truncated: result.truncated };
  let cut = bytes.length - OUTPUT_LIMIT;
  while (cut < bytes.length && (bytes[cut] & 0xc0) === 0x80) cut++;
  return { text: bytes.subarray(cut).toString('utf8'), truncated: true };
}

// Files are compared by content under the ordinary capture policy, so dependency and generated
// folders may differ. Modes are only comparable where the file system stores them.
async function sourceChanges(service: RecoveryService, directory: string, expected: Array<{ path: string; sha256: string; mode: string }>): Promise<string[]> {
  const current = new Map((await captureSource(directory, service.gitDir)).files.map(file => [file.path, file]));
  const known = new Set(expected.map(entry => entry.path));
  const changes: string[] = [];
  for (const entry of expected) {
    // A tracked file may match .gitignore. Recovery intentionally omits .git, so verify
    // every manifest entry directly rather than dropping it from a new-folder scan.
    const file = path.join(directory, ...entry.path.split('/'));
    try {
      await assertNoLinks(directory, file);
      const stat = await fs.lstat(file);
      const mode = stat.mode & 0o111 ? '100755' : '100644';
      if (!stat.isFile() || sha256(await fs.readFile(file)) !== entry.sha256 || (process.platform !== 'win32' && mode !== entry.mode)) changes.push(`${entry.path} was changed`);
    } catch { changes.push(`${entry.path} was removed or could not be verified`); }
  }
  for (const file of current.keys()) if (!known.has(file)) changes.push(`${file} was added`);
  return changes;
}
const listChanges = (changes: string[]) => changes.slice(0, 10).join('; ') + (changes.length > 10 ? `; and ${changes.length - 10} more` : '');

export async function runCheckpointCheck(service: RecoveryService, request: Extract<RecoveryRequest, { action: 'runCheck' }>): Promise<CheckpointEvidence> {
  await service.readMetadata(request.checkpointId);
  const command = boundedText(request.command, 'The check command', MAX_COMMAND);
  const timeoutSeconds = request.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (typeof timeoutSeconds !== 'number' || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) throw new Error('The check time limit must be a whole number of seconds from 1 to 600');
  const checkpoint = await service.readCheckpoint(request.checkpointId);
  if (checkpoint.evidence.length >= MAX_EVIDENCE_PER_CHECKPOINT) throw new Error(`This milestone already has ${MAX_EVIDENCE_PER_CHECKPOINT} evidence entries`);
  const { manifest } = await service.readManifest(checkpoint.commitOid);
  const holder = await fs.mkdtemp(path.join(os.tmpdir(), 'bitgit-check-'));
  const workingCopy = path.join(holder, 'source');
  try { await service.recover(checkpoint.id, workingCopy); } catch (error) {
    await fs.rm(holder, { recursive: true, force: true });
    throw error;
  }

  const started = Date.now();
  const result = await runManagedCheck(command, workingCopy, timeoutSeconds * 1000, checkEnvironment(service));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  let changes: string[] = [], verificationError: string | null = null;
  try { changes = await sourceChanges(service, workingCopy, manifest.entries); } catch (error) {
    verificationError = error instanceof Error ? error.message : String(error);
  }
  const output = boundedOutput(result, service);

  const ran = result.error ? `The command could not be started: ${result.error}`
    : result.timedOut ? `The command exceeded its ${timeoutSeconds} s limit and ${result.stopped ? 'its process tree was stopped' : 'could not be confirmed stopped'}`
    : result.exitCode !== null ? `The command exited with code ${result.exitCode} after ${seconds} s`
    : `The command was terminated by ${result.signal ?? 'a signal'} after ${seconds} s`;
  const failed = result.error !== undefined || result.timedOut || result.exitCode !== 0;
  const outcome: CheckpointEvidence['outcome'] = failed ? 'failed' : changes.length || verificationError || result.background || !result.stopped ? 'untested' : 'passed';
  const notes = [ran + ' in a fresh recovered copy of this checkpoint. This result covers only that command and checkpoint.'];
  if (result.background) notes.push('Background descendants outlived the command; their cleanup was requested and this run cannot certify the checkpoint.');
  if (!result.stopped) notes.push('The command process tree could not be confirmed stopped.');
  if (changes.length) notes.push(`The command altered the recovered copy (${listChanges(changes)})${failed ? '.' : ', so the run is recorded as untested.'}`);
  if (verificationError) notes.push(`The recovered copy could not be verified after the command (${verificationError})${failed ? '.' : ', so the run is recorded as untested.'}`);
  if (output.truncated) notes.push('Only the last 32 KiB of output is kept.');
  const redactedCommand = redact(command, service);
  const commandTruncated = redactedCommand.length > MAX_COMMAND;
  const commandMarker = ' [truncated]';
  const recordedCommand = commandTruncated ? redactedCommand.slice(0, MAX_COMMAND - commandMarker.length) + commandMarker : redactedCommand;
  if (commandTruncated) notes.push('The recorded command was shortened after credential redaction; the full command you confirmed was executed.');

  const entry: CheckpointEvidence = { id: randomUUID(), recordedAt: service.now(), kind: 'command', description: redact(notes.join(' '), service).slice(0, MAX_DESCRIPTION),
    outcome, checkpointId: checkpoint.id, command: recordedCommand, exitCode: result.timedOut ? null : result.exitCode, output: output.text, workingCopyPath: workingCopy };
  await appendEvidence(service, checkpoint.id, entry);
  return entry;
}
