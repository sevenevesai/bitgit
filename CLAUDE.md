# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BitGit** is a Windows desktop application for managing multiple Git repositories with GitHub integration. Built with Tauri (Rust backend) + React (TypeScript frontend) + Node.js Git service.

**Current Status:** 95% Complete - Production Ready ✅

The application is fully functional and stable. Core features (push, merge, sync, token storage, auto-pruning) are implemented and tested. See `SESSION_NOTES.md` for latest session details.

## Architecture

### Three-Layer Architecture

1. **Frontend (React + TypeScript)**
   - Dashboard UI for repository management
   - State management with Zustand
   - Tailwind CSS for styling
   - Built with Vite

2. **Backend (Rust/Tauri)**
   - Command handlers for IPC
   - Windows Credential Manager integration for secure token storage
   - Repository scanning and configuration management
   - Settings stored in JSON files

3. **Git Service (Node.js)**
   - Long-running subprocess spawned by Rust backend
   - Uses `simple-git` for Git operations
   - Uses `@octokit/rest` for GitHub API calls
   - Communicates with Rust via IPC

### Communication Flow
```
React UI → Tauri Commands (IPC) → Rust Backend → Node.js Git Service → simple-git/Octokit
```

## Project Structure (Planned)

```
/
├── src/                        # React frontend
│   ├── components/            # UI components
│   ├── stores/               # Zustand state stores
│   └── types/                # TypeScript types
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs       # Tauri command handlers
│   │   ├── git_service.rs    # Node.js process manager
│   │   ├── credentials.rs    # Windows Credential Manager
│   │   ├── config.rs         # Settings management
│   │   └── models.rs         # Data structures
│   └── Cargo.toml
├── git-service/               # Node.js Git operations
│   ├── src/
│   │   ├── index.ts          # IPC server
│   │   ├── git-operations.ts # Git commands wrapper
│   │   ├── github-api.ts     # GitHub API client
│   │   └── types.ts          # Shared types
│   └── package.json
└── README.md                  # Technical implementation plan
```

## Development Commands

### Project Initialization (Not yet done)
```bash
# Initialize Tauri project
npm create tauri-app@latest

# Install dependencies
npm install
cd git-service && npm install && cd ..

# Development mode
npm run tauri dev

# Build production
npm run tauri build
```

## Core Technology Stack

### Frontend Dependencies
- react: ^18.2.0
- typescript: ^5.0.0
- vite: ^5.0.0
- tailwindcss: ^3.4.0
- zustand: ^4.4.0 (state management)
- react-hot-toast: ^2.4.0 (notifications)
- @headlessui/react: ^1.7.0 (accessible components)
- lucide-react: ^0.300.0 (icons)

### Backend Dependencies (Rust)
- tauri: 1.5
- serde + serde_json: 1.0
- tokio: 1.x (async runtime)
- anyhow: 1.0 (error handling)
- windows: 0.52 (Credential Manager integration)
- walkdir: 2.4 (repository scanning)

### Git Service Dependencies (Node.js)
- simple-git: ^3.21.0
- @octokit/rest: ^20.0.2

## Key Implementation Details

### Repository Data Model
```typescript
interface Repository {
  id: string;
  name: string;
  localPath: string;
  githubUrl: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  status: RepositoryStatus;
  settings: RepositorySettings;
  history: OperationLog[];
}
```

### Core Features
1. **Push Local** - Stage, commit, and push uncommitted changes to main
2. **Merge Branches** - Merge and delete remote non-main branches
3. **Full Sync** - Combine push local + merge branches
4. **Add to GitHub** - Create new GitHub repository and push existing local repo

### Security Considerations
- GitHub Personal Access Tokens stored in Windows Credential Manager (never in config files)
- Never use force push operations
- Always preserve Git history with --no-ff merges
- Validate token format before storage (ghp_* or github_pat_*)

### Error Handling Strategy
Error categories: NETWORK, AUTH, GIT, FILESYSTEM, GITHUB_API
- All errors provide user-friendly messages with suggested actions
- Recoverable errors allow retry, non-recoverable suggest remediation
- Git merge conflicts handled explicitly with VS Code integration

### Performance Optimization
- Parallel status checking (batched in groups of 10)
- 30-second status caching to avoid redundant checks
- Optimistic UI updates with rollback on failure
- Background status checking without blocking UI

## Development Roadmap

### Phase 1: Foundation (Week 1)
- Project setup: Initialize Tauri + React + Node.js Git service
- Core backend: Rust command handlers, IPC, credential manager
- Git operations: Implement simple-git wrapper for all sync operations

### Phase 2: GitHub Integration (Week 2)
- GitHub API client setup with Octokit
- Repository scanner and detection
- Authentication flow and token management

### Phase 3: UI Development (Week 3)
- Dashboard with repository list and status indicators
- Action buttons with loading states and feedback
- Settings modal for configuration

### Phase 4: Testing & Release (Week 4)
- Unit and integration tests
- Manual testing and bug fixes
- Documentation and MVP release

## Git Workflow

### Safe Git Operations
```typescript
// Always use --no-ff for merges to preserve history
await git.merge([branch, '--no-ff', '-m', `Merge branch '${branch}'`]);

// Never force push
await git.push('origin', 'main'); // NOT: ['--force']

// Auto-commit format
const message = `Auto-sync: ${new Date().toISOString()}`;
```

### Branch Management
- Main/master branches are protected
- Remote branches (excluding main/master) can be merged and deleted
- Branch merging: checkout → merge to main → push → delete remote → delete local

## Critical Requirements

1. **Git Installation**: Application requires Git for Windows to be installed
2. **Node.js Runtime**: Bundled with the application for Git service
3. **Windows Only**: Uses Windows Credential Manager (cross-platform support is future enhancement)
4. **Personal Access Token**: Users must generate GitHub PAT with repo permissions

## Current State

**Status: Production Ready (90% Complete)**

All major systems are implemented and working:
- ✅ React UI with Dashboard, Settings, and Repository cards
- ✅ Rust backend with Tauri IPC commands
- ✅ Node.js Git service with simple-git and Octokit
- ✅ IPC communication (Rust ↔ Node.js via stdin/stdout)
- ✅ Windows Credential Manager integration
- ✅ Repository scanning and status detection
- ✅ Git operations (push, merge, full sync)
- ✅ All builds successful

**To run:** `npm run tauri:dev`

**What's left:** Optional enhancements (batch operations, auto-sync, production installer)
