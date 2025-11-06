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

  constructor() {
    this.setupInputListener();
    this.log('Git service IPC server started');
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
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const result = await git.pushLocal();
          return { id: command.id, success: true, data: result };
        }

        case 'mergeBranches': {
          const { repoPath, branches } = command.payload;
          const git = new GitOperations(repoPath);
          const merged = await git.mergeBranches(branches);
          return { id: command.id, success: true, data: { merged } };
        }

        case 'pullBranches': {
          const { repoPath, branches } = command.payload;
          const git = new GitOperations(repoPath);
          const pulled = await git.pullBranches(branches);
          return { id: command.id, success: true, data: { pulled } };
        }

        case 'fullSync': {
          const { repoPath } = command.payload;
          const git = new GitOperations(repoPath);
          const result = await git.fullSync();
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
    // Write JSON response to stdout
    console.log(JSON.stringify(response));
  }

  private log(message: string) {
    // Log to stderr so it doesn't interfere with stdout IPC
    console.error(`[GitService] ${message}`);
  }
}

// Start the IPC server
new IPCServer();
