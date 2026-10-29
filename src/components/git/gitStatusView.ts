import type { Project } from '../../types';

// A "Synced" claim needs a recent successful read of the remote. Older than this it is shown as unconfirmed.
export const STATUS_STALE_MS = 30 * 60 * 1000;

export function formatRelativeTime(dateString: string, now: number = Date.now()): string {
  const date = new Date(dateString);
  const diffSeconds = Math.floor((now - date.getTime()) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export type CardTone =
  | 'synced'
  | 'unconfirmed'
  | 'changes'
  | 'behind'
  | 'diverged'
  | 'unavailable'
  | 'not_git'
  | 'ready'
  | 'github_only'
  | 'local_only'
  | 'not_configured';

export interface CardStatus {
  tone: CardTone;
  text: string;
}

export function isRemoteCheckStale(remoteCheckedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!remoteCheckedAt) return true;
  const checked = new Date(remoteCheckedAt).getTime();
  return Number.isNaN(checked) || now - checked > STATUS_STALE_MS;
}

export interface RemoteTarget {
  href: string;   // https page for the browser
  label: string;  // host/path, never credentials
}

// The web page for a Git remote URL (https, ssh:// or scp-style git@host:path). Local paths,
// file:// and other schemes have no page and return null. Credentials and ssh ports are dropped.
export function remoteTarget(raw: string | null | undefined): RemoteTarget | null {
  const value = raw?.trim();
  if (!value || value.length > 2048) return null;

  let protocol = 'https:';
  let host: string;
  let path: string;
  const scp = value.match(/^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/);
  if (!value.includes('://') && scp && scp[1].includes('.')) {
    // A dotted host rules out drive letters (C:\repo), ssh config aliases and other schemes.
    [, host, path] = scp;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      protocol = url.protocol;
      host = url.host;
    } else if (url.protocol === 'ssh:' || url.protocol === 'git+ssh:' || url.protocol === 'git:') {
      host = url.hostname;
    } else {
      return null;
    }
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return null; // a malformed %-escape
    }
  }

  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!host || !path || /[\s\\]/.test(host + path)) return null;
  return { href: `${protocol}//${host}/${encodeURI(path)}`, label: `${host}/${path}` };
}

// Connected means a saved GitHub link, or a remote in the folder that publishing would push to: the
// branch's upstream, else origin (GitLab and other hosts included). Other remotes alone do not count.
export function hasGitRemote(project: Pick<Project, 'githubUrl' | 'gitStatus'>): boolean {
  return Boolean(project.githubUrl || project.gitStatus?.upstream || project.gitStatus?.remoteUrl);
}

// What the card badge says. Anything the last check could not confirm is never shown as Synced.
export function getCardStatus(project: Project, now: number = Date.now()): CardStatus {
  if (project.projectStatus === 'not_configured') return { tone: 'not_configured', text: 'Not Configured' };
  if (!project.localPath) return { tone: 'github_only', text: 'GitHub Only' };

  const git = project.gitStatus;
  if (git && git.isGitRepo === false) return { tone: 'not_git', text: 'Git unavailable' };

  if (!hasGitRemote(project)) return { tone: 'local_only', text: 'Local Only' };
  if (!git) return { tone: 'ready', text: 'Not checked yet' };

  switch (git.syncStatus) {
    case 'unavailable':
      return { tone: 'unavailable', text: 'Status unavailable' };
    case 'diverged':
      return { tone: 'diverged', text: 'Diverged from remote' };
    case 'behind':
      return { tone: 'behind', text: 'Behind remote' };
    case 'both':
      return { tone: 'diverged', text: 'Changes here, updates on the remote' };
    case 'local_changes':
      return { tone: 'changes', text: 'Changes to publish' };
    case 'remote_branches':
      return { tone: 'behind', text: 'Other branches on the remote' };
    case 'not_connected':
      return { tone: 'ready', text: 'Not connected to a remote branch' };
    case 'synced':
      return isRemoteCheckStale(git.remoteCheckedAt, now)
        ? { tone: 'unconfirmed', text: 'Not confirmed recently' }
        : { tone: 'synced', text: 'Synced' };
    default:
      return { tone: 'ready', text: 'Unknown' };
  }
}
