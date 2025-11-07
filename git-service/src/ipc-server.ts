import * as readline from 'readline';
import { GitOperations, cloneRepository, initRepository, addRemote, pushToRemote } from './git-operations.js';
import { GitHubAPI } from './github-api.js';

// IPC Server for communication with Rust backend via stdin/stdout
// Commands are received as JSON on stdin, responses sent as JSON on stdout

interface IPCCommand {
  id: string;
  type: string;
  payload: any;
}

interface IPCResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export class IPCServer {
  private githubToken?: string;
  private isShuttingDown = false;

  constructor() {
    this.setupErrorHandlers();
    this.setupInputListener();
    this.log('Git service IPC server started');
  }

  private setupErrorHandlers() {
    // Handle broken pipe errors when parent process disconnects
    process.stdout.on('error', (err: any) => {
      if (err.code === 'EPIPE' && !this.isShuttingDown) {
        this.isShuttingDown = true;
        this.log('Parent process disconnected, shutting down gracefully');
        process.exit(0);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err: any) => {
      if (err.code === 'EPIPE' && !this.isShuttingDown) {
        this.isShuttingDown = true;
        this.log('Broken pipe detected, shutting down gracefully');
        process.exit(0);
      } else {
        this.log(`Uncaught exception: ${err.message}`);
        process.exit(1);
      }
    });
  }

  private setupInputListener() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line: string) => {
      try {
        const command: IPCCommand = JSON.parse(line);
        const response = await this.handleCommand(command);
        this.sendResponse(response);
      } catch (error: any) {
        this.sendResponse({
          id: 'unknown',
          success: false,
          error: `Failed to parse command: ${error.message}`,
        });
      }
    });

    rl.on('close', () => {
      this.log('IPC server shutting down');
      process.exit(0);
    });
  }

  private async handleCommand(command: IPCCommand): Promise<IPCResponse> {
    try {
      switch (command.type) {
        case 'ping':
          return { id: command.id, success: true, data: 'pong' };

        case 'setGithubToken':
          this.githubToken = command.payload.token;
          return { id: command.id, success: true };

        case 'checkStatus': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const status = await git.checkStatus();
          return { id: command.id, success: true, data: status };
        }

        case 'pushLocal': {
          const { repoPath, remoteUrl } = command.payload;
          const git = new GitOperations(repoPath);
          const result = await git.pushLocal(remoteUrl);
          return { id: command.id, success: true, data: result };
        }

        case 'mergeBranches': {
          const { repoPath, branches, remoteUrl } = command.payload;
          const git = new GitOperations(repoPath);
          const merged = await git.mergeBranches(branches, remoteUrl);
          return { id: command.id, success: true, data: { merged } };
        }

        case 'pullBranches': {
          const { repoPath, branches, remoteUrl } = command.payload;
          const git = new GitOperations(repoPath);
          const pulled = await git.pullBranches(branches, remoteUrl);
          return { id: command.id, success: true, data: { pulled } };
        }

        case 'fullSync': {
          const { repoPath, remoteUrl } = command.payload;
          const git = new GitOperations(repoPath);
          const result = await git.fullSync(remoteUrl);
          return { id: command.id, success: true, data: result };
        }

        case 'createGithubRepo': {
          if (!this.githubToken) {
            throw new Error('GitHub token not set');
          }
          const { name, isPrivate } = command.payload;
          const github = new GitHubAPI(this.githubToken);
          const url = await github.createRepository(name, isPrivate);
          return { id: command.id, success: true, data: { url } };
        }

        case 'verifyGithubToken': {
          const { token } = command.payload;
          const github = new GitHubAPI(token);
          const result = await github.verifyToken();
          return { id: command.id, success: true, data: result };
        }

        case 'listGithubRepos': {
          const { token } = command.payload;
          const github = new GitHubAPI(token);
          const repos = await github.listUserRepositories();
          return { id: command.id, success: true, data: repos };
        }

        case 'cloneRepository': {
          const { githubUrl, localPath } = command.payload;
          await cloneRepository(githubUrl, localPath);
          return { id: command.id, success: true };
        }

        case 'createGithubRepository': {
          const { token, repoName, isPrivate } = command.payload;
          const github = new GitHubAPI(token);
          const cloneUrl = await github.createRepository(repoName, isPrivate);
          return { id: command.id, success: true, data: { cloneUrl } };
        }

        case 'initRepository': {
          const { localPath } = command.payload;
          await initRepository(localPath);
          return { id: command.id, success: true };
        }

        case 'addRemote': {
          const { localPath, remoteName, remoteUrl } = command.payload;
          await addRemote(localPath, remoteName, remoteUrl);
          return { id: command.id, success: true };
        }

        case 'pushToRemote': {
          const { localPath, remoteName, branch } = command.payload;
          await pushToRemote(localPath, remoteName, branch);
          return { id: command.id, success: true };
        }

        // Advanced Git Features
        case 'getBranches': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const branches = await git.getBranches();
          return { id: command.id, success: true, data: branches };
        }

        case 'createBranch': {
          const { repoPath, branchName, checkout } = command.payload;
          const git = new GitOperations(repoPath);
          await git.createBranch(branchName, checkout);
          return { id: command.id, success: true };
        }

        case 'switchBranch': {
          const { repoPath, branchName } = command.payload;
          const git = new GitOperations(repoPath);
          await git.switchBranch(branchName);
          return { id: command.id, success: true };
        }

        case 'deleteBranch': {
          const { repoPath, branchName, force } = command.payload;
          const git = new GitOperations(repoPath);
          await git.deleteBranch(branchName, force);
          return { id: command.id, success: true };
        }

        case 'getCommitHistory': {
          const { repoPath, limit } = command.payload;
          const git = new GitOperations(repoPath);
          const commits = await git.getCommitHistory(limit || 50);
          return { id: command.id, success: true, data: commits };
        }

        case 'getDiff': {
          const { repoPath, filePath } = command.payload;
          const git = new GitOperations(repoPath);
          const diffs = await git.getDiff(filePath);
          return { id: command.id, success: true, data: diffs };
        }

        case 'createStash': {
          const { repoPath, message } = command.payload;
          const git = new GitOperations(repoPath);
          await git.createStash(message);
          return { id: command.id, success: true };
        }

        case 'listStashes': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const stashes = await git.listStashes();
          return { id: command.id, success: true, data: stashes };
        }

        case 'applyStash': {
          const { repoPath, index } = command.payload;
          const git = new GitOperations(repoPath);
          await git.applyStash(index);
          return { id: command.id, success: true };
        }

        case 'popStash': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          await git.popStash();
          return { id: command.id, success: true };
        }

        case 'dropStash': {
          const { repoPath, index } = command.payload;
          const git = new GitOperations(repoPath);
          await git.dropStash(index);
          return { id: command.id, success: true };
        }

        case 'createTag': {
          const { repoPath, tagName, message } = command.payload;
          const git = new GitOperations(repoPath);
          await git.createTag(tagName, message);
          return { id: command.id, success: true };
        }

        case 'listTags': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const tags = await git.listTags();
          return { id: command.id, success: true, data: tags };
        }

        case 'pushTag': {
          const { repoPath, tagName } = command.payload;
          const git = new GitOperations(repoPath);
          await git.pushTag(tagName);
          return { id: command.id, success: true };
        }

        case 'pushAllTags': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          await git.pushAllTags();
          return { id: command.id, success: true };
        }

        case 'deleteTag': {
          const { repoPath, tagName } = command.payload;
          const git = new GitOperations(repoPath);
          await git.deleteTag(tagName);
          return { id: command.id, success: true };
        }

        case 'cherryPick': {
          const { repoPath, commitHash } = command.payload;
          const git = new GitOperations(repoPath);
          await git.cherryPick(commitHash);
          return { id: command.id, success: true };
        }

        case 'getCurrentBranch': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const branch = await git.getCurrentBranch();
          return { id: command.id, success: true, data: branch };
        }

        // Analytics Features
        case 'getAnalyticsCommitHistory': {
          const { repoPath, params } = command.payload;
          const git = new GitOperations(repoPath);
          const commits = await git.getAnalyticsCommitHistory(params);
          return { id: command.id, success: true, data: commits };
        }

        case 'getBranchStaleness': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const staleness = await git.getBranchStaleness();
          return { id: command.id, success: true, data: staleness };
        }

        case 'getCommitCountsByDate': {
          const { repoPath, since, until, author } = command.payload;
          const git = new GitOperations(repoPath);
          const counts = await git.getCommitCountsByDate({ since, until, author });
          return { id: command.id, success: true, data: counts };
        }

        case 'getDaysSinceLastCommit': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const days = await git.getDaysSinceLastCommit();
          return { id: command.id, success: true, data: days };
        }

        case 'getAggregateStats': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const stats = await git.getAggregateStats();
          return { id: command.id, success: true, data: stats };
        }

        case 'getCommitCountForDateRange': {
          const { repoPath, since, until } = command.payload;
          const git = new GitOperations(repoPath);
          const count = await git.getCommitCountForDateRange(since, until);
          return { id: command.id, success: true, data: count };
        }

        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
    } catch (error: any) {
      return {
        id: command.id,
        success: false,
        error: error.message,
      };
    }
  }

  private sendResponse(response: IPCResponse) {
    if (this.isShuttingDown) {
      return; // Don't try to send responses during shutdown
    }

    try {
      // Write JSON response to stdout
      console.log(JSON.stringify(response));
    } catch (error: any) {
      if (error.code === 'EPIPE') {
        this.isShuttingDown = true;
        this.log('Broken pipe when sending response, shutting down');
        process.exit(0);
      } else {
        throw error;
      }
    }
  }

  private log(message: string) {
    // Log to stderr so it doesn't interfere with stdout IPC
    console.error(`[GitService] ${message}`);
  }
}

// Start the IPC server
new IPCServer();
