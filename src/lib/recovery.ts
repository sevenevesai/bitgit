import { invoke } from '@tauri-apps/api/tauri';
import type { RecoveryRequest, RecoveryResults } from '../types/recovery';

export type RecoveryAction = RecoveryRequest['action'];
// An indexed lookup rather than Extract<>: generic signatures built on Extract<> cannot be
// related to each other when passed through the gate.
type RequestByAction = { [R in RecoveryRequest as R['action']]: R };
export type RequestOf<A extends RecoveryAction> = RequestByAction[A];

// In-flight calls and open workspaces per project. Every recovery call goes through
// recoveryCall, so this is the one place that can say whether a project is busy; the
// background observer consults it instead of guessing from component state.
const inflight = new Map<string, { interactive: number; background: number }>();
const openWorkspaces = new Map<string, number>();

function track(projectId: string, background: boolean): () => void {
  const entry = inflight.get(projectId) ?? { interactive: 0, background: 0 };
  inflight.set(projectId, entry);
  const key = background ? 'background' : 'interactive';
  entry[key] += 1;
  return () => {
    entry[key] -= 1;
    if (entry.interactive + entry.background === 0 && inflight.get(projectId) === entry) inflight.delete(projectId);
  };
}

export interface ProjectActivity {
  workspaceOpen: boolean;
  interactiveBusy: boolean;
  backgroundBusy: boolean;
}

export function projectActivity(projectId: string): ProjectActivity {
  const entry = inflight.get(projectId);
  return {
    workspaceOpen: (openWorkspaces.get(projectId) ?? 0) > 0,
    interactiveBusy: (entry?.interactive ?? 0) > 0,
    backgroundBusy: (entry?.background ?? 0) > 0,
  };
}

// Returns the release function. Counted, so two windows for one project cannot unpause each other.
export function markWorkspaceOpen(projectId: string): () => void {
  openWorkspaces.set(projectId, (openWorkspaces.get(projectId) ?? 0) + 1);
  return () => {
    const remaining = (openWorkspaces.get(projectId) ?? 1) - 1;
    if (remaining <= 0) openWorkspaces.delete(projectId);
    else openWorkspaces.set(projectId, remaining);
  };
}

// `& { action: A }` lets TypeScript infer A from the literal, so each call site gets
// that action's own request shape and result type.
export function recoveryCall<A extends RecoveryAction>(
  projectId: string,
  request: RequestOf<A> & { action: A },
  options?: { background?: boolean },
): Promise<RecoveryResults[A]> {
  const release = track(projectId, options?.background === true);
  return invoke<RecoveryResults[A]>('recovery_command', { projectId, request }).finally(release);
}

const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const TOKEN_LIKE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

export function redactSecrets(text: string): string {
  return text.replace(URL_USERINFO, '$1***@').replace(TOKEN_LIKE, '[token removed]');
}

// Tauri rejects with the command's Err(String); other failures arrive as Error or objects.
export function errorMessage(error: unknown): string {
  let text: string;
  if (typeof error === 'string') {
    text = error;
  } else if (error instanceof Error) {
    text = error.message;
  } else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    text = (error as { message: string }).message;
  } else {
    text = 'The recovery action failed without an error message.';
  }
  return redactSecrets(text.trim() || 'The recovery action failed without an error message.');
}

// Engine failures for a fingerprint mismatch are plain messages, not codes; this only adds
// a hint. The verbatim error is always shown too.
export function looksStale(message: string): boolean {
  return /stale|fingerprint|changed (since|during)|concurrent/i.test(message);
}

// Drive letter (C:\ or C:/), UNC share (\\server\share) or POSIX root: a folder on this computer.
const LOCAL_ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\[^\\/]|\/)/i;
const CREDENTIAL_MESSAGE = 'Remove the username, password or token from the URL. BitGit never puts credentials in remote URLs.';

// The engine enforces protocol and credential rules; this rejects the obvious mistakes
// before anything is sent.
export function validateRemoteUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'Enter the remote repository URL.';
  if (/[\u0000-\u001f\u007f]/.test(url)) return 'The remote URL cannot contain control characters.';
  // A bare repository in a folder on this computer is a valid remote, and folder names may hold spaces.
  if (LOCAL_ABSOLUTE_PATH.test(url)) return null;
  if (/^["']|["']$/.test(url)) return 'Remove the quotation marks around the location.';
  if (/\s/.test(url)) return 'A remote URL cannot contain spaces. For a folder on this computer, enter its full path.';
  if (/^[a-z][a-z0-9+.-]*::/i.test(url)) return 'Remote helper URLs are not supported.';
  const withUserinfo = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)@/i.exec(url);
  if (withUserinfo) {
    const scheme = withUserinfo[1].toLowerCase();
    const userinfo = withUserinfo[2];
    if (scheme === 'http' || scheme === 'https' || userinfo.includes(':')) return CREDENTIAL_MESSAGE;
  }
  // scp-style user:secret@host:path
  if (/^[^\s/@:]+:[^\s/@]+@/.test(url)) return CREDENTIAL_MESSAGE;
  if (/^[a-z][a-z0-9+.-]*:\/\/[^?#]*[?#]/i.test(url)) return 'Remove the ? or # part of the URL. It can carry credentials and is not accepted.';
  return null;
}
