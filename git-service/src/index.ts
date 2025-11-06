// BitGit Git Service - IPC Server
// Communicates with Rust backend via stdin/stdout JSON messages

import './ipc-server.js';

// Export main operations for external use
export { GitOperations } from './git-operations.js';
export { GitHubAPI } from './github-api.js';
