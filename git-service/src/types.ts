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

// Advanced Git feature types
export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  isRemote: boolean;
}

export interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  body: string;
  refs: string;
}

export interface DiffInfo {
  fileName: string;
  changes: Array<{
    line: number;
    type: 'add' | 'remove' | 'context';
    content: string;
  }>;
}

export interface StashInfo {
  index: number;
  hash: string;
  message: string;
  date: string;
}

export interface TagInfo {
  name: string;
}

export type GitOperation =
  | { type: 'checkStatus'; repoPath: string }
  | { type: 'pushLocal'; repoPath: string }
  | { type: 'mergeBranches'; repoPath: string; branches: string[] }
  | { type: 'pullBranches'; repoPath: string; branches: string[] }
  | { type: 'fullSync'; repoPath: string }
  // Advanced operations
  | { type: 'getBranches'; repoPath: string }
  | { type: 'createBranch'; repoPath: string; branchName: string; checkout: boolean }
  | { type: 'switchBranch'; repoPath: string; branchName: string }
  | { type: 'deleteBranch'; repoPath: string; branchName: string; force: boolean }
  | { type: 'getCommitHistory'; repoPath: string; limit: number }
  | { type: 'getDiff'; repoPath: string; filePath?: string }
  | { type: 'createStash'; repoPath: string; message?: string }
  | { type: 'listStashes'; repoPath: string }
  | { type: 'applyStash'; repoPath: string; index: number }
  | { type: 'popStash'; repoPath: string }
  | { type: 'dropStash'; repoPath: string; index: number }
  | { type: 'createTag'; repoPath: string; tagName: string; message?: string }
  | { type: 'listTags'; repoPath: string }
  | { type: 'pushTag'; repoPath: string; tagName: string }
  | { type: 'pushAllTags'; repoPath: string }
  | { type: 'deleteTag'; repoPath: string; tagName: string }
  | { type: 'cherryPick'; repoPath: string; commitHash: string }
  | { type: 'getCurrentBranch'; repoPath: string };
