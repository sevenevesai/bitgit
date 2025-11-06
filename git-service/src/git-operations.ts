import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { StatusInfo, SyncResult } from './types.js';

export class GitOperations {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Ensures the directory is initialized as a git repository.
   * If .git doesn't exist, initializes it with main branch.
   * Returns true if initialization was needed, false if already a repo.
   */
  async ensureGitRepo(): Promise<boolean> {
    try {
      // Try to get status - if this succeeds, it's already a git repo
      await this.git.status();
      return false; // Already initialized
    } catch (error) {
      // Not a git repo, initialize it
      console.error(`[Git] Directory ${this.repoPath} is not a git repository, initializing...`);
      await this.git.init(['-b', 'main']);
      console.error(`[Git] Initialized git repository at ${this.repoPath}`);
      return true; // Just initialized
    }
  }

  async checkStatus(): Promise<StatusInfo> {
    // Ensure this is a git repository before checking status
    await this.ensureGitRepo();
    try {
      // Try to fetch and prune, but don't fail if it doesn't work
      try {
        await this.git.fetch(['--prune', 'origin']);
      } catch (fetchError) {
        console.error('Warning: Fetch failed, continuing with local status check:', fetchError);
        // Continue anyway - we can still check local status
      }

      const status: StatusResult = await this.git.status();

      // Get remote branches, but don't fail if it doesn't work
      let remoteBranches: string[] = [];
      try {
        const branches = await this.git.branch(['-r']);
        remoteBranches = Object.keys(branches.branches)
          .filter((b) => b.startsWith('origin/'))
          .map((b) => b.replace('origin/', ''))
          .filter((b) => !['main', 'master', 'HEAD'].includes(b));
      } catch (branchError) {
        console.error('Warning: Failed to get remote branches:', branchError);
        // Continue with empty array
      }

      console.error('[Git Status Check]', {
        path: this.repoPath,
        files: status.files.length,
        modified: status.modified.length,
        created: status.created.length,
        deleted: status.deleted.length,
        not_added: status.not_added.length,
        ahead: status.ahead,
        behind: status.behind,
      });

      return {
        uncommittedFiles: status.files.length,
        untrackedFiles: status.not_added.length,
        modifiedFiles: status.files.map((f) => f.path),
        unpushedCommits: status.ahead,
        remoteBranches,
      };
    } catch (error) {
      throw new Error(`Failed to check status: ${error}`);
    }
  }

  async pushLocal(): Promise<{ committed: number; pushed: boolean }> {
    // Ensure this is a git repository
    await this.ensureGitRepo();

    try {
      const status = await this.git.status();
      const currentBranch = status.current || 'main';

      // If no changes to commit, return early
      if (status.files.length === 0) {
        return { committed: 0, pushed: false };
      }

      // Pull latest changes from remote ONLY if there are no local changes
      // This avoids the "cannot pull with unstaged changes" error
      if (currentBranch && status.files.length === 0) {
        try {
          await this.git.pull('origin', currentBranch, ['--rebase']);
        } catch (pullError) {
          console.error(`Warning: Pull failed, continuing with push: ${pullError}`);
        }
      }

      // Stage all changes
      await this.git.add('.');

      // Commit with timestamp
      const message = `Auto-sync: ${new Date().toISOString()}`;
      await this.git.commit(message);

      // Push to current branch
      await this.git.push('origin', currentBranch);

      return { committed: status.files.length, pushed: true };
    } catch (error) {
      throw new Error(`Failed to push local changes: ${error}`);
    }
  }

  async mergeBranches(branches: string[]): Promise<string[]> {
    // Ensure this is a git repository
    await this.ensureGitRepo();

    const merged: string[] = [];

    // Get current branch and ensure we're on main/master before starting
    const initialStatus = await this.git.status();
    const mainBranch = initialStatus.current || 'main';

    // Only proceed if we're starting from main/master
    if (mainBranch !== 'main' && mainBranch !== 'master') {
      throw new Error(`Must be on main/master branch to merge. Currently on: ${mainBranch}`);
    }

    try {
      // Fetch all remotes and prune stale branches
      await this.git.fetch(['--prune', 'origin']);

      for (const branch of branches) {
        try {
          console.error(`[Git] Starting merge of branch: ${branch}`);

          // Fetch the remote branch
          await this.git.fetch(['origin', branch]);

          // Merge the remote branch directly (no need to checkout)
          await this.git.merge([`origin/${branch}`, '--no-ff', '-m', `Merge branch '${branch}'`]);

          console.error(`[Git] Merged ${branch} successfully`);

          // Push updated main
          await this.git.push('origin', mainBranch);
          console.error(`[Git] Pushed main branch`);

          // Delete remote branch
          await this.git.push(['origin', '--delete', branch]);
          console.error(`[Git] Deleted remote branch ${branch}`);

          // Delete local branch if it exists
          try {
            await this.git.branch(['-d', branch]);
          } catch (e) {
            // Branch might not exist locally, that's OK
          }

          merged.push(branch);
        } catch (error) {
          console.error(`[Git] Failed to merge ${branch}:`, error);
          // If merge failed, try to abort it to clean up
          try {
            await this.git.merge(['--abort']);
            console.error(`[Git] Aborted failed merge of ${branch}`);
          } catch (abortError) {
            // Merge might not have been in progress
          }
          // Continue with other branches
        }
      }

      return merged;
    } catch (error) {
      // Ensure we're back on main branch if anything went wrong
      try {
        const currentStatus = await this.git.status();
        if (currentStatus.current !== mainBranch) {
          await this.git.checkout(mainBranch);
          console.error(`[Git] Returned to ${mainBranch} after error`);
        }
      } catch (checkoutError) {
        console.error(`[Git] Failed to return to main branch:`, checkoutError);
      }
      throw new Error(`Failed to merge branches: ${error}`);
    }
  }

  /**
   * Pull updates from remote branches without deleting them.
   * Use this for iterative work (e.g., pulling from Claude Code web sessions).
   * The branches remain alive for future pulls.
   */
  async pullBranches(branches: string[]): Promise<string[]> {
    // Ensure this is a git repository
    await this.ensureGitRepo();

    const pulled: string[] = [];

    // Get current branch and ensure we're on main/master before starting
    const initialStatus = await this.git.status();
    const mainBranch = initialStatus.current || 'main';

    // Only proceed if we're starting from main/master
    if (mainBranch !== 'main' && mainBranch !== 'master') {
      throw new Error(`Must be on main/master branch to pull. Currently on: ${mainBranch}`);
    }

    try {
      // Fetch all remotes and prune stale branches
      await this.git.fetch(['--prune', 'origin']);

      for (const branch of branches) {
        try {
          console.error(`[Git] Starting pull of branch: ${branch}`);

          // Fetch the remote branch
          await this.git.fetch(['origin', branch]);

          // Merge the remote branch directly (no need to checkout)
          await this.git.merge([`origin/${branch}`, '--no-ff', '-m', `Pull updates from branch '${branch}'`]);

          console.error(`[Git] Pulled ${branch} successfully`);

          // Push updated main
          await this.git.push('origin', mainBranch);
          console.error(`[Git] Pushed main branch`);

          // NOTE: Branch is NOT deleted - it stays alive for future pulls

          pulled.push(branch);
        } catch (error) {
          console.error(`[Git] Failed to pull ${branch}:`, error);
          // If merge failed, try to abort it to clean up
          try {
            await this.git.merge(['--abort']);
            console.error(`[Git] Aborted failed pull of ${branch}`);
          } catch (abortError) {
            // Merge might not have been in progress
          }
          // Continue with other branches
        }
      }

      return pulled;
    } catch (error) {
      // Ensure we're back on main branch if anything went wrong
      try {
        const currentStatus = await this.git.status();
        if (currentStatus.current !== mainBranch) {
          await this.git.checkout(mainBranch);
          console.error(`[Git] Returned to ${mainBranch} after error`);
        }
      } catch (checkoutError) {
        console.error(`[Git] Failed to return to main branch:`, checkoutError);
      }
      throw new Error(`Failed to pull branches: ${error}`);
    }
  }

  async fullSync(): Promise<SyncResult> {
    // Ensure this is a git repository
    await this.ensureGitRepo();

    const result: SyncResult = {
      success: true,
      message: 'Full sync completed',
      committed: 0,
      merged: [],
      errors: [],
    };

    try {
      // Step 0: Fetch and prune to get latest remote state
      await this.git.fetch(['--prune', 'origin']);

      // Check if there are local changes first
      const initialStatus = await this.git.status();
      const currentBranch = initialStatus.current || 'main';

      // Only pull if there are NO local changes
      // This avoids "cannot pull with unstaged changes" error
      if (currentBranch && initialStatus.files.length === 0) {
        try {
          await this.git.pull('origin', currentBranch, ['--rebase']);
        } catch (pullError) {
          console.error(`Warning: Pull failed during full sync: ${pullError}`);
        }
      }

      // Step 1: Check if there are local changes (after potential pull)
      const status = await this.git.status();
      if (status.files.length > 0) {
        try {
          const pushResult = await this.pushLocal();
          result.committed = pushResult.committed;
        } catch (error: any) {
          result.errors?.push(`Push failed: ${error.message}`);
          result.success = false;
        }
      }

      // Step 2: Check for remote branches
      const statusInfo = await this.checkStatus();
      if (statusInfo.remoteBranches.length > 0) {
        try {
          const merged = await this.mergeBranches(statusInfo.remoteBranches);
          result.merged = merged;
        } catch (error: any) {
          result.errors?.push(`Merge failed: ${error.message}`);
          result.success = false;
        }
      }

      if (result.errors && result.errors.length > 0) {
        result.message = 'Full sync completed with errors';
      }
    } catch (error: any) {
      result.success = false;
      result.message = `Full sync failed: ${error.message}`;
      result.errors?.push(error.message);
    }

    return result;
  }
}

// Standalone Git operations (not tied to a specific repository)

export async function cloneRepository(githubUrl: string, localPath: string): Promise<void> {
  try {
    const git = simpleGit();
    await git.clone(githubUrl, localPath);
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error}`);
  }
}

export async function initRepository(localPath: string): Promise<void> {
  try {
    const git = simpleGit(localPath);
    let isNewRepo = false;

    // Check if already a git repository
    try {
      await git.status();
      // Already a git repo
    } catch (e) {
      // Not a git repo, initialize with main branch
      await git.init(['-b', 'main']);
      isNewRepo = true;
    }

    // Check if there are any commits
    let hasCommits = false;
    try {
      await git.log(['-n', '1']);
      hasCommits = true;
    } catch (e) {
      // No commits yet
      hasCommits = false;
    }

    // If no commits, create initial commit
    if (!hasCommits) {
      const status = await git.status();

      // If there are files to commit
      if (status.files.length > 0 || status.not_added.length > 0) {
        // Stage all files
        await git.add('.');
        await git.commit('Initial commit');
      } else {
        // No files exist, create a README
        const fs = await import('fs/promises');
        const path = await import('path');
        const readmePath = path.join(localPath, 'README.md');

        await fs.writeFile(readmePath, '# Project\n\nInitialized with BitGit\n');
        await git.add('README.md');
        await git.commit('Initial commit');
      }

      // Ensure we're on main branch (for older git versions that might use master)
      try {
        const currentBranch = (await git.status()).current;
        if (currentBranch !== 'main') {
          await git.branch(['-M', 'main']);
        }
      } catch (e) {
        // Branch rename might fail, but that's ok
      }
    }
  } catch (error) {
    throw new Error(`Failed to initialize repository: ${error}`);
  }
}

export async function addRemote(localPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  try {
    const git = simpleGit(localPath);

    // Check if remote already exists
    const remotes = await git.getRemotes(false);
    const remoteExists = remotes.some(r => r.name === remoteName);

    if (remoteExists) {
      // Update existing remote
      await git.remote(['set-url', remoteName, remoteUrl]);
    } else {
      // Add new remote
      await git.addRemote(remoteName, remoteUrl);
    }
  } catch (error) {
    throw new Error(`Failed to add remote: ${error}`);
  }
}

export async function pushToRemote(localPath: string, remoteName: string, branch: string): Promise<void> {
  try {
    const git = simpleGit(localPath);

    // Check current branch
    const status = await git.status();
    const currentBranch = status.current;

    if (!currentBranch) {
      throw new Error('Repository has no current branch. Make sure there is at least one commit.');
    }

    // If we're not on the target branch
    if (currentBranch !== branch) {
      // Check if target branch exists locally
      const branches = await git.branchLocal();

      if (branches.all.includes(branch)) {
        // Branch exists, checkout
        await git.checkout(branch);
      } else {
        // Branch doesn't exist, rename current branch or create new one
        if (currentBranch === 'master' && branch === 'main') {
          // Special case: rename master to main
          await git.branch(['-M', 'main']);
        } else {
          // Create new branch from current HEAD
          await git.checkoutLocalBranch(branch);
        }
      }
    }

    // Push with set-upstream
    await git.push(['-u', remoteName, branch]);
  } catch (error) {
    throw new Error(`Failed to push to remote: ${error}`);
  }
}
