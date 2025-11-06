// Core data models for BitGit

// Main Project interface - can have GitHub, Local, both, or neither
export interface Project {
  id: string;
  name: string;

  // GitHub (optional)
  githubOwner: string | null;
  githubRepo: string | null;
  githubUrl: string | null;

  // Local (optional)
  localPath: string | null;

  // Overall project state
  projectStatus: ProjectStatus;

  // Git status (only when both GitHub and Local are linked)
  gitStatus: GitStatus | null;

  // Timestamps
  createdAt: string;
  lastSynced: string | null;
}

// Overall project configuration state
export type ProjectStatus =
  | 'not_configured'     // Neither GitHub nor Local
  | 'github_only'        // Has GitHub, no Local
  | 'local_only'         // Has Local, no GitHub
  | 'ready'              // Both linked, needs status check
  | 'synced'             // Both linked, everything in sync
  | 'needs_push'         // Both linked, has local changes
  | 'needs_merge'        // Both linked, has remote branches
  | 'needs_sync';        // Both linked, has both issues

// Git status for fully configured projects
export interface GitStatus {
  isGitRepo: boolean;
  hasRemote: boolean;

  // Local state
  uncommittedFiles: number;
  untrackedFiles: number;
  modifiedFiles: string[];

  // Remote state
  unpushedCommits: number;
  remoteBranches: string[];

  // Sync state
  syncStatus: 'synced' | 'local_changes' | 'remote_branches' | 'both' | 'not_connected';
  lastChecked: string;
}

// Legacy type alias for compatibility
export type Repository = Project;
export type RepositoryStatus = GitStatus;

export interface RepositorySettings {
  defaultBranch: string;
  autoSync: boolean;
  excludeFromBatch: boolean;
}

export interface OperationLog {
  id: string;
  timestamp: Date;
  action: 'push_local' | 'merge_branches' | 'full_sync' | 'add_to_github' | 'check_status';
  result: 'success' | 'error' | 'partial';
  message: string;
  details?: string;
}

export type SyncAction =
  | { type: 'push_local' }
  | { type: 'merge_branches'; branches: string[] }
  | { type: 'pull_branches'; branches: string[] }
  | { type: 'full_sync' };

export interface SyncResult {
  success: boolean;
  message: string;
  details: {
    committed?: number;
    pushed?: number;
    merged?: string[];
    deleted?: string[];
    errors?: string[];
  };
  newStatus?: RepositoryStatus;
}

export interface AppSettings {
  github: GitHubSettings;
  scanning: ScanSettings;
  ui: UISettings;
}

export interface GitHubSettings {
  username: string;
  hasToken: boolean;
}

export interface ScanSettings {
  directories: string[];
  depth: number;
  excludePatterns: string[];
}

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  refreshInterval: number;
  showNotifications: boolean;
}
