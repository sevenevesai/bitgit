// Shared types between Rust and Node.js Git service

export interface StatusInfo {
  uncommittedFiles: number;
  untrackedFiles: number;
  modifiedFiles: string[];
  unpushedCommits: number;
  remoteBranches: string[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  committed?: number;
  pushed?: number;
  merged?: string[];
  deleted?: string[];
  errors?: string[];
}

export type GitOperation =
  | { type: 'checkStatus'; repoPath: string }
  | { type: 'pushLocal'; repoPath: string }
  | { type: 'mergeBranches'; repoPath: string; branches: string[] }
  | { type: 'fullSync'; repoPath: string };
