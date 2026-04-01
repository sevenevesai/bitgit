# BitGit

**A modern, high-performance Git repository manager for developers who work with multiple projects.**

![BitGit](bitgit-icon-square.png)

---

## What is BitGit?

BitGit is a Windows desktop application that makes it effortless to manage dozens of Git repositories and their GitHub connections. Whether you're a solo developer juggling multiple side projects, or a team lead overseeing microservices, BitGit keeps everything organized and in sync.

### Why BitGit?

**The Problem:** Managing multiple repositories is tedious
- Manually checking status across 10+ repos
- Forgetting which projects have uncommitted changes
- Losing track of remote branches that need merging
- Switching between GitHub and local directories constantly

**The Solution:** BitGit automates and visualizes everything
- See all your projects at a glance
- One-click sync operations for any repo
- Background status checking (never miss a change)
- Parallel operations (sync 10 repos in the time it takes to do one)

---

## Features

### Core Functionality ✅
- **Project Management** - Create, link, archive, and favorite projects
- **Git Operations** - Push, pull, merge, sync with one click
- **GitHub Integration** - Create repos, clone, secure token storage
- **Status Detection** - Real-time tracking of uncommitted changes and branches
- **Safe Operations** - Never breaks your repo with smart merge handling

### Advanced Git Tools ✅
- **Branch Management** - View, switch, create, and delete branches
- **Commit History** - Visual timeline of all commits
- **Diff Viewer** - See exactly what changed
- **Stash Manager** - Save and restore work-in-progress
- **Tag Management** - Create, push, and manage release tags

### Performance & Reliability ✅
- **Background Checking** - Auto-refresh all projects every 5 minutes
- **Parallel Operations** - Sync multiple projects simultaneously (3-5x faster)
- **Auto-Retry** - Exponential backoff handles transient failures
- **Operation Queue** - Cancel, retry, or track long-running operations

### User Experience ✅
- **Dark Mode** - Easy on the eyes for late-night coding
- **Custom Branding** - Professional BitGit icon and UI
- **Keyboard Shortcuts** - Ctrl+R refresh, Ctrl+N new project, etc.
- **Search & Filter** - Find projects instantly by name, status, or path
- **Batch Operations** - Select multiple projects and sync them all at once

---

## Getting Started

### Prerequisites
- Windows 10/11
- Git for Windows installed
- GitHub Personal Access Token (for GitHub integration)

### Running BitGit

**Development Mode:**
```bash
npm run tauri:dev
```

**Production Build:**
```bash
npm run tauri:build
```

### First-Time Setup
1. Launch BitGit
2. Click Settings (gear icon) and add your GitHub token
3. Click "+" to create or link your first project
4. Start managing all your repos from one place!

---

## How It Works

**Three-Layer Architecture:**

```
┌─────────────────────┐
│   React Frontend    │  TypeScript, Vite, Tailwind CSS
│   (Zustand Store)   │
└──────────┬──────────┘
           │ Tauri IPC
           ↓
┌─────────────────────┐
│   Rust Backend      │  Tauri, Windows Credential Manager
│   (Commands)        │
└──────────┬──────────┘
           │ JSON IPC via stdin/stdout
           ↓
┌─────────────────────┐
│ Node.js Git Service │  simple-git, @octokit/rest
│ (IPC Server)        │
└─────────────────────┘
```

**Why This Architecture?**
- **Small & Fast** - ~10MB app size, <100MB RAM usage
- **Best Libraries** - Uses `simple-git` (best Node.js Git library)
- **Native Integration** - Windows Credential Manager for secure tokens
- **Modern UI** - React + Tailwind for rapid development

---

## Project States

BitGit intelligently handles 8 different project configurations:

| State | GitHub | Local | Available Actions |
|-------|--------|-------|-------------------|
| **not_configured** | ✗ | ✗ | Link GitHub, Link Local |
| **github_only** | ✓ | ✗ | Clone to Local, Link Existing Local |
| **local_only** | ✗ | ✓ | Create GitHub Repo, Link Existing GitHub |
| **ready** | ✓ | ✓ | All Git Operations |
| **synced** | ✓ | ✓ | Everything in sync ✅ |
| **needs_push** | ✓ | ✓ | Has uncommitted changes |
| **needs_merge** | ✓ | ✓ | Has remote branches to merge |
| **needs_sync** | ✓ | ✓ | Has both local changes and remote branches |

---

## Key Operations

### For Local Changes
- **Push Local** - Stage, commit, and push all changes to main branch

### For Remote Branches
- **Pull Updates** - Merge branch updates, keep branch alive (for iterative work)
- **Merge & Delete** - Merge branch and delete it (final cleanup)

### Combined
- **Full Sync** - Push local changes + merge all remote branches

### Utilities
- **Refresh Status** - Check current Git status on demand
- **Open in VS Code** - Open project directory in editor

---

## Roadmap - Next-Generation Features

### 🎯 Priority 1: Dashboard Analytics & Insights
- Overview panel with project statistics
- Activity timeline across all projects
- Repository health indicators
- Contribution heatmap with streak tracking

### 🗂️ Priority 2: Workspace & Organization
- Multiple workspaces (Work, Personal, Client projects)
- Project groups and collections
- Smart auto-grouping (Recently Active, Needs Attention, Stale)
- Custom tags and labels

### ⚡ Priority 3: Automation & Workflows
- Scheduled sync operations
- Workflow templates (End of Day Sync, etc.)
- Auto-actions based on rules
- Git hooks integration

### 🔍 Priority 4: Discovery & Bulk Import
- Full system scan for all Git repos
- Bulk GitHub import (import all your repos at once)
- Quick setup wizard for new users
- Project templates and scaffolding

### 👥 Priority 5: Collaboration Features
- Collaborator visibility
- Pull request integration
- Branch comparison tools
- Team activity feed

### 🔌 Priority 6: External Tool Integration
- VS Code extension
- CI/CD status display (GitHub Actions, etc.)
- Issue tracker integration (GitHub Issues, Jira)
- Custom command palette

---

## Technology Stack

**Frontend:**
- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- Zustand (state management)
- Lucide React (icons)

**Backend (Rust):**
- Tauri 1.5
- Windows Credential Manager
- Tokio (async runtime)

**Git Service (Node.js):**
- simple-git 3.21
- @octokit/rest 20.0

---

## Development

### Project Structure
```
bitgit/
├── src/                     # React frontend
├── src-tauri/               # Rust backend
├── git-service/             # Node.js Git service
├── docs/                    # Historical documentation
├── SESSION_NOTES.md         # Development progress
├── CLAUDE.md                # Instructions for Claude Code
└── README.md                # This file
```

### Key Files
- `git-service/src/git-operations.ts` - All Git commands (~300 lines)
- `src-tauri/src/commands.rs` - Backend IPC handlers (~600 lines)
- `src/components/ProjectCard.tsx` - Main UI component (~600 lines)
- `src/stores/useAppStore.ts` - State management (~580 lines)

### Contributing
Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

---

## Credits

Built with:
- [Tauri](https://tauri.app/) - Desktop framework
- [simple-git](https://github.com/steveukx/git-js) - Git operations
- [Octokit](https://github.com/octokit/rest.js) - GitHub API
- [React](https://react.dev/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Status

**Current Version:** 0.1.0 (Beta)
**Completion:** ~95% of core features
**Status:** Production-ready for daily use
**Platform:** Windows 10/11 (macOS/Linux support planned)

**Repository:** https://github.com/sevenevesai/bitgit

---

*BitGit is actively maintained and used daily to manage real projects. Try it out!*
