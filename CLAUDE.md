# CLAUDE.md

Project context for Claude Code sessions.

## Project Overview

**BitGit** is a Windows desktop app for managing multiple Git repositories with GitHub integration. Built for developers who want quick, reliable syncing without terminal juggling.

**Status:** Production Ready - Active Development

**Stack:** Tauri (Rust) + React (TypeScript) + Node.js Git Service

## Quick Reference

```bash
# Development
npm run tauri:dev          # Start app (Vite + Tauri)
npm run tauri:build        # Production build

# If port 5173 stuck:
taskkill //F //PID $(netstat -ano | findstr :5173 | awk '{print $5}')

# Git service only
cd git-service && npm run build

# Rust only
cd src-tauri && cargo check
```

## Architecture

```
React UI → Tauri IPC → Rust Backend → Node.js Git Service → simple-git/Octokit
```

| Layer | Location | Purpose |
|-------|----------|---------|
| Frontend | `src/` | React + Zustand + Tailwind |
| Backend | `src-tauri/src/` | Tauri commands, credential manager, project cache |
| Git Service | `git-service/src/` | Git operations, GitHub API, validation |

### Key Files
- `src/components/ProjectCard.tsx` - Main project UI, sync buttons, validation flow
- `src/components/SettingsModal.tsx` - Token management, repo scanning
- `src-tauri/src/commands.rs` - All Tauri command handlers
- `src-tauri/src/project_cache.rs` - Resilient JSON storage with atomic writes
- `git-service/src/git-operations.ts` - Git commands, pre-sync validation
- `git-service/src/ipc-server.ts` - IPC message handlers

## Working Style

### How We Collaborate
- **Problem-first**: User describes issues or goals, not implementation details
- **Investigate before fixing**: Read code, add debug logging, understand root cause
- **Iterative**: Build → test → refine based on real usage feedback
- **Graceful UX**: Never show "data corrupt, start again" - always recover silently
- **No over-engineering**: Solve the current problem, don't anticipate hypotheticals

### Session Patterns
- User often returns after using the app for a while with real-world issues
- Debugging sessions: Add logging → run app → analyze output → fix
- Feature requests come as user experience descriptions, not specs
- Build verification: Run `npm run tauri:dev` and check for errors

## Core Patterns

### Data Persistence (Resilient Cache)
Projects stored in `%APPDATA%/BitGit/projects.json` with:
- Atomic writes (temp file → rename)
- Automatic `.bak` backup before overwrites
- Auto-recovery from backup if main file corrupted
- Validation before and after writes

### Pre-Sync Validation
Before pushing to GitHub, validate for:
- **Errors** (blocking): Files >100MB (GitHub hard limit)
- **Warnings** (user choice): Files >50MB, databases, node_modules, logs, etc.
- Shows modal with issues and "Add to .gitignore" button

### Git Safety Rules
```typescript
// Always --no-ff to preserve history
await git.merge([branch, '--no-ff', '-m', `Merge branch '${branch}'`]);

// Never force push
await git.push('origin', 'main'); // NOT: ['--force']

// Auto-commit message format
`Auto-sync: ${new Date().toISOString()}`
```

### IPC Pattern (Rust ↔ Node.js)
```rust
// Rust side - git_service.rs
let result = self.execute("commandName", payload)?;

// Node.js side - ipc-server.ts
case 'commandName': {
    const result = await git.someOperation();
    return { id: command.id, success: true, data: result };
}
```

## Security

- GitHub tokens stored in Windows Credential Manager (never in files)
- Token validation on Settings modal open (real-time status)
- Pre-selected scopes when linking to GitHub token creation
- Required scopes: `repo` (full) or `public_repo` (minimum), plus `read:user`

## Common Issues

| Problem | Solution |
|---------|----------|
| "Port 5173 in use" | Kill zombie node: `taskkill //F //IM node.exe` |
| "Failed to load projects" | Cache corrupted - now auto-recovers from backup |
| Token shows valid but ops fail | Token may lack required scopes - recreate with `repo` scope |
| Push fails silently | Check for >100MB files - validation modal should catch this |

## Adding New Features

### New Tauri Command
1. Add function in `src-tauri/src/commands.rs`
2. Register in `src-tauri/src/main.rs` invoke_handler
3. Call from frontend: `invoke<ReturnType>('command_name', { params })`

### New Git Operation
1. Add method in `git-service/src/git-operations.ts`
2. Add IPC handler in `git-service/src/ipc-server.ts`
3. Add Rust wrapper in `src-tauri/src/git_service.rs`
4. Add Tauri command in `src-tauri/src/commands.rs`

### New UI Component
1. Create in `src/components/`
2. Use existing patterns: useState for local state, Zustand for global
3. Use toast for notifications, lucide-react for icons
4. Follow dark mode pattern: `className="text-gray-900 dark:text-white"`

## What's Implemented

- Project management (create, link local/GitHub, delete)
- Git sync operations (push, pull, merge, full sync)
- Pre-sync validation with gitignore suggestions
- GitHub token management with real-time validation
- Repository scanning from directories
- Resilient data persistence with auto-recovery
- Advanced git features (branches, stashes, tags, cherry-pick)
- Analytics dashboard with commit history

## Potential Enhancements

- Batch operations on multiple selected projects
- Auto-sync on schedule or file change detection
- Production installer (currently dev mode only)
- Cross-platform support (currently Windows only)
