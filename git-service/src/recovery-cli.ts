#!/usr/bin/env node
// Harness entry point: one RecoveryRequest in on stdin, one JSON line out. It dispatches through the
// same RecoveryService as the app, so lock, validation and safety policy are identical. It must not
// import index.ts or ipc-server.ts: those start the IPC listener.
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecoveryService } from './recovery-service.js';
import type { RecoveryRequest } from './recovery-types.js';

export const MAX_REQUEST_BYTES = 1024 * 1024;
const ACTIONS: Record<RecoveryRequest['action'], true> = {
  state: true, preview: true, create: true, compare: true, recover: true, repair: true, repairRollback: true, backup: true, verifyBackup: true,
  remoteList: true, remoteImport: true, settings: true, autoTick: true, evidence: true, runCheck: true, regressionStart: true,
  regressionObserve: true, regressionGet: true,
};

class UsageError extends Error {}

export const HELP = `bitgit-recovery: run one BitGit recovery request from a script or AI harness.

Usage:
  node dist/recovery-cli.js --repo <absolute project path> [--vault-root <absolute folder>] < request.json

Protocol:
  stdin   exactly one RecoveryRequest JSON object (max 1 MiB); {"action": "...", ...fields}
  stdout  exactly one JSON line: {"success":true,"data":...} or {"success":false,"error":"..."}
  exit    0 success; 1 the request failed; 2 bad arguments, empty/oversized/malformed input or unknown action
  Nothing runs unless a request is sent. Progress is never written to stdout. Remote access uses
  your Git credential helper; there are no token flags or files.

Actions: ${Object.keys(ACTIONS).join(', ')}

Examples:
  echo {"action":"create","label":"Before refactor"} | node dist/recovery-cli.js --repo C:\\work\\app
  echo {"action":"state"} | node dist/recovery-cli.js --repo C:\\work\\app
  echo {"action":"runCheck","checkpointId":"<id>","command":"npm test","timeoutSeconds":300} | node dist/recovery-cli.js --repo C:\\work\\app
`;

export function parseCliArgs(argv: string[]): { help: boolean; repo?: string; vaultRoot?: string } {
  const parsed: { help: boolean; repo?: string; vaultRoot?: string } = { help: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') { parsed.help = true; continue; }
    if (flag !== '--repo' && flag !== '--vault-root') throw new UsageError(`Unknown argument: ${flag}. Use --help for the protocol.`);
    const key = flag === '--repo' ? 'repo' : 'vaultRoot';
    const value = argv[++index];
    if (parsed[key] !== undefined) throw new UsageError(`${flag} was given more than once`);
    if (!value || !path.isAbsolute(value)) throw new UsageError(`${flag} requires an absolute path`);
    parsed[key] = value;
  }
  return parsed;
}

export function parseCliRequest(text: string): RecoveryRequest {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new UsageError('No request received. Send one JSON request on stdin.');
  let request: unknown;
  try { request = JSON.parse(trimmed); } catch { throw new UsageError('The request is not valid JSON.'); }
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new UsageError('The request must be a JSON object.');
  const action = (request as { action?: unknown }).action;
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, action)) throw new UsageError(`Unknown or missing action. Expected one of: ${Object.keys(ACTIONS).join(', ')}`);
  return request as RecoveryRequest;
}

async function readRequest(stdin: NodeJS.ReadableStream & { isTTY?: boolean }): Promise<string> {
  if (stdin.isTTY) throw new UsageError('Pipe one JSON request on stdin (see --help).');
  const chunks: Buffer[] = [];
  let size = 0;
  // An oversized request is still drained so the writer is not left with a broken pipe.
  for await (const chunk of stdin) {
    size += (chunk as Buffer).length;
    if (size <= MAX_REQUEST_BYTES) chunks.push(chunk as Buffer);
  }
  if (size > MAX_REQUEST_BYTES) throw new UsageError('The request exceeds the 1 MiB limit.');
  return Buffer.concat(chunks).toString('utf8');
}

export async function runCli(argv: string[], stdin: NodeJS.ReadableStream & { isTTY?: boolean }, write: (text: string) => Promise<void>): Promise<number> {
  const reply = async (body: { success: true; data: unknown } | { success: false; error: string }, code: number) => { await write(`${JSON.stringify(body)}\n`); return code; };
  try {
    const args = parseCliArgs(argv);
    if (args.help) { await write(HELP); return 0; }
    if (!args.repo) throw new UsageError('--repo <absolute project path> is required. Use --help for the protocol.');
    const request = parseCliRequest(await readRequest(stdin));
    const service = new RecoveryService(args.repo, args.vaultRoot ? { vaultRoot: args.vaultRoot } : {});
    return await reply({ success: true, data: await service.dispatch(request) }, 0);
  } catch (error) {
    return reply({ success: false, error: error instanceof Error ? error.message : String(error) }, error instanceof UsageError ? 2 : 1);
  }
}

const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  // Setting exitCode (not exit()) lets a piped stdout finish flushing large responses.
  const write = (text: string) => new Promise<void>(resolve => process.stdout.write(text, () => resolve()));
  runCli(process.argv.slice(2), process.stdin, write).then(code => { process.exitCode = code; });
}
