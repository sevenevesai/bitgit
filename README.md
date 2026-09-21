# BitGit

**Website:** https://seveneves.ai/bitgit/

**Save milestones, compare changes, and recover your code during AI-assisted development.**

![BitGit](bitgit-icon-square.png)

---

## What is BitGit?

BitGit is a Windows desktop app for people building with AI and developers who prefer visual Git.
Save a working milestone before a large coding session, inspect what changed, and recover a separate
copy or repair selected files while preserving a safety checkpoint. Local recovery works without
GitHub and without initializing Git in your project.

Start with the [recovery guide](docs/RECOVERY_GUIDE.md), then explore
[automatic saves, evidence and regression finding](docs/RECOVERY_WORKFLOWS.md),
[visual Git](docs/VISUAL_GIT_GUIDE.md), or the [JSON harness CLI](docs/RECOVERY_AUTOMATION.md#cli).
The [audience review and research](docs/PRODUCT_REVIEW.md) explain the product direction.

### Why BitGit?

**The Problem:** Managing multiple repositories is tedious
- Manually checking status across 10+ repos
- Forgetting which projects have uncommitted changes
- Losing track of remote branches that need merging
- Switching between GitHub and local directories constantly

**The workflow:** Save, inspect, recover
- See all your projects at a glance
- Name milestones and inspect exactly which files are covered
- Enable local automatic saves after inactivity while BitGit is open
- Recover an old version separately before deciding what to repair

---

## Features

### Core Functionality ✅
- **Recovery Milestones** - Manual and automatic checkpoints with coverage and exclusions
- **Recover & Repair** - Verified new copies or selected-file repair with a safety checkpoint
- **Remote Recovery** - Explicit backup verification and import into a fresh vault
- **Evidence & Regression Search** - Notes, screenshots, explicit checks, and good/bad/skip history
- **Harness CLI** - The same checkpoint and recovery API through JSON requests
- **Project Management** - Create, link, archive, and favorite projects
- **Git Operations** - Review selected files before publishing; push existing commits separately
- **GitHub Integration** - Create repos, clone, secure token storage
- **Status Detection** - Branch/upstream, local changes, ahead/behind, and remote-check failures
- **Publish Validation** - Block credentials and oversized files; review warnings before proceeding

### Advanced Git Tools ✅
- **Branch Management** - View, switch, create, and delete branches
- **Commit History** - Visual timeline of all commits
- **Diff Viewer** - See exactly what changed
- **Stash Manager** - Save and restore work-in-progress
- **Tag Management** - Create, push, and manage release tags

### Performance & Reliability ✅
- **Background Checking** - Auto-refresh all projects every 5 minutes
- **Batch Operations** - Process selected projects with individual results
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
- Node.js 20 or later on PATH (the desktop app runs the Node Git service)
- GitHub Personal Access Token only when using GitHub integration
- Rust and the Tauri Windows build prerequisites when building from source

### Running BitGit

**Development Mode:**
```bash
npm run tauri:dev
```

For a fresh checkout, first run `npm ci`, `npm --prefix git-service ci`, and
`npm --prefix git-service run build`. Development instructions: [DEVELOPMENT.md](docs/DEVELOPMENT.md).

**Production Build:**
```bash
npm run tauri:build
```

### First-Time Setup
1. Launch BitGit
2. Click "+" and link a local project folder
3. Open **Save & Recover**, review coverage, and save a named milestone
4. Optionally configure GitHub in Settings and review files before publishing

Local checkpoints are stored on this machine. For disk-loss protection, use Remote backup and
verify the destination. Code recovery excludes credentials, databases, dependencies and external
services; it does not recreate a deployed application. Command checks run with your normal permissions.

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

Project configuration and Git status are separate. Every local project can use Save & Recover.

| State | GitHub | Local | Available Actions |
|-------|--------|-------|-------------------|
| **not_configured** | ✗ | ✗ | Link GitHub, Link Local |
| **github_only** | ✓ | ✗ | Clone to Local, Link Existing Local |
| **local_only** | ✗ | ✓ | Save & Recover, inspect Git, optionally link GitHub |
| **ready** | ✓ | ✓ | All Git Operations |
| **synced** | optional | ✓ | Current branch matches its last checked upstream |
| **needs_push** | ✓ | ✓ | Has uncommitted changes |
| **needs_merge** | ✓ | ✓ | Has remote branches to merge |
| **needs_sync** | ✓ | ✓ | Has both local changes and remote branches |
| **behind / diverged** | optional | ✓ | Current upstream has commits to review |
| **unavailable** | optional | ✓ | Status could not be checked; recovery history remains accessible |

---

## Key Operations

### For Local Changes
- **Push Local** - Commit reviewed whole files and publish the current branch to its upstream

### For Remote Branches
- **Pull / Merge Branches** - Integrate explicitly selected remote branches; retain source branches

### Combined
- **Full Sync** - Update the current upstream when safe; publish reviewed changes or existing commits

### Utilities
- **Refresh Status** - Check current Git status on demand
- **Open in VS Code** - Open project directory in editor

---

## Earlier product ideas

The active roadmap is the [recovery plan](docs/RECOVERY_PLAN.md). The ideas below are retained for
reference and are not commitments for this release.

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
- `git-service/src/recovery-service.ts` - Checkpoint, repair and remote recovery dispatch
- `git-service/src/git-operations.ts` - Git operations and publishing validation
- `src-tauri/src/commands.rs` - Native IPC handlers
- `src/components/ProjectCard.tsx` - Project actions
- `src/stores/useAppStore.ts` - Application state

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

**Build Version:** 1.0.0
**Status:** Active development; recovery roadmap implementation under verification
**Platform:** Windows 10/11 (macOS/Linux support planned)

**Repository:** https://github.com/sevenevesai/bitgit

---

See the recovery guides for supported workflows and their limits.
