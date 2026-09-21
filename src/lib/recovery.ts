import { invoke } from '@tauri-apps/api/tauri';
import type { RecoveryRequest, RecoveryResults } from '../types/recovery';

export type RecoveryAction = RecoveryRequest['action'];
// An indexed lookup rather than Extract<>: generic signatures built on Extract<> cannot be
// related to each other when passed through the gate.
type RequestByAction = { [R in RecoveryRequest as R['action']]: R };
export type RequestOf<A extends RecoveryAction> = RequestByAction[A];

// `& { action: A }` lets TypeScript infer A from the literal, so each call site gets
// that action's own request shape and result type.
export function recoveryCall<A extends RecoveryAction>(
  projectId: string,
  request: RequestOf<A> & { action: A },
): Promise<RecoveryResults[A]> {
  return invoke<RecoveryResults[A]>('recovery_command', { projectId, request });
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

// The engine enforces protocol and credential rules; this rejects the obvious mistakes
// before anything is sent.
export function validateRemoteUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'Enter the remote repository URL.';
  if (/[\s\u0000-\u001f]/.test(url)) return 'The remote URL cannot contain spaces or control characters.';
  if (/^[a-z][a-z0-9+.-]*::/i.test(url)) return 'Remote helper URLs are not supported.';
  const withUserinfo = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)@/i.exec(url);
  if (withUserinfo) {
    const scheme = withUserinfo[1].toLowerCase();
    const userinfo = withUserinfo[2];
    if (scheme === 'http' || scheme === 'https' || userinfo.includes(':')) {
      return 'Remove the username, password or token from the URL. BitGit never puts credentials in remote URLs.';
    }
  }
  return null;
}
