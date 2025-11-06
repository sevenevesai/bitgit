# bitgit
A Github Repo Manager
---
# 🔧 BitGit Technical Implementation Plan
## Architecture & Technology Research Document

---

## Executive Summary

After comprehensive analysis of the requirements, I'm recommending a **Tauri + React + TypeScript** stack with **simple-git** for Git operations and **GitHub REST API** for remote operations. This provides the optimal balance of performance, development speed, native Windows integration, and long-term maintainability for this specific use case.

Let me walk through the complete technical analysis and locked-in decisions.

---

## 1. Platform & Framework Decision

### Research Analysis

#### Option A: Electron + Node.js
**Evaluation:**
- ✅ Mature ecosystem, extensive resources
- ✅ Excellent UI frameworks (React, Vue)
- ✅ Strong Git libraries (`simple-git`)
- ✅ Easy GitHub API integration
- ❌ 150-200MB+ app size
- ❌ 200-300MB+ RAM usage
- ❌ Slower startup time (2-3 seconds)
- ❌ Not truly native Windows feel

**For 50 repos:** Performance acceptable but resource-heavy

#### Option B: .NET MAUI + C#
**Evaluation:**
- ✅ Native Windows performance
- ✅ Smaller footprint (~50MB)
- ✅ Fast startup (<1 second)
- ✅ Aligns with your .NET expertise
- ✅ `LibGit2Sharp` is solid
- ❌ UI component ecosystem much smaller
- ❌ Less flexibility for modern web-style UI
- ❌ Slower iteration on UI/UX changes
- ❌ MAUI is still maturing (bugs, documentation gaps)

**For 50 repos:** Excellent performance, but UI development slower

#### Option C: Tauri + Rust/TypeScript + React
**Evaluation:**
- ✅ Tiny app size (~10MB)
- ✅ 50-100MB RAM usage
- ✅ Fast startup (~1 second)
- ✅ Modern web UI with React/Tailwind
- ✅ Native Windows APIs via Rust
- ✅ Growing ecosystem, good documentation
- ✅ Can use Node.js for Git operations (best of both worlds)
- ⚠️ Newer (v1.0 released 2022, but stable)
- ⚠️ Smaller community than Electron

**For 50 repos:** Excellent performance, modern UI, fast development

### 🎯 DECISION: Tauri + React + TypeScript

**Rationale:**
1. **Performance:** Near-native speed, minimal resource usage critical for background status checking
2. **UI Development Speed:** React + Tailwind = rapid iteration on dashboard design
3. **Best of Both Worlds:** Rust backend for performance + Node.js subprocess for Git operations
4. **Future-Proof:** Modern architecture, active development, growing adoption
5. **Windows Integration:** Direct access to Windows Credential Manager via Rust
6. **Resource Efficiency:** Critical when checking 50+ repos in background

**Trade-off Accepted:** Slightly smaller ecosystem than Electron, but mitigated by excellent documentation and growing community.

---

## 2. Git Operations Library

### Research Analysis

#### Option A: simple-git (Node.js)
```bash
npm install simple-git
```
**Evaluation:**
- ✅ Comprehensive API coverage
- ✅ Promise-based, async-friendly
- ✅ Actively maintained (7k+ stars)
- ✅ Excellent documentation
- ✅ Handles edge cases well
- ✅ Works with any Git CLI installation
- ❌ Requires Git installed on system

**Example:**
```typescript
const simpleGit = require('simple-git');
const git = simpleGit('/path/to/repo');

// Get status
const status = await git.status();
console.log(status.files); // Modified files

// Push to main
await git.add('.');
await git.commit('Auto-sync: ' + new Date().toISOString());
await git.push('origin', 'main');
```

#### Option B: nodegit (Native LibGit2 bindings)
**Evaluation:**
- ✅ No Git installation required
- ✅ Pure Node.js bindings to LibGit2
- ❌ Complex API (low-level)
- ❌ Maintenance issues (lagging LibGit2 versions)
- ❌ Platform-specific binaries can break
- ❌ Harder to debug

#### Option C: Direct CLI Wrapper
**Evaluation:**
- ✅ Full control
- ✅ No library dependency issues
- ❌ Must handle all parsing manually
- ❌ Error handling complex
- ❌ Reinventing the wheel

### 🎯 DECISION: simple-git via Node.js subprocess

**Implementation Architecture:**
```
Tauri App (Rust)
    ↓
  Spawns Node.js process (long-running)
    ↓
  Node.js uses simple-git
    ↓
  Communicates results back to Tauri via IPC
```

**Rationale:**
1. **Best API:** simple-git is the most ergonomic and reliable
2. **Async Operations:** Perfect for background status checking
3. **Error Handling:** Library handles Git quirks
4. **Git Installation:** Acceptable requirement (devs always have Git)
5. **Performance:** Node process stays alive, no repeated startup cost

**Git Installation Check:**
- App checks for Git on first launch
- If missing, shows instructions to install Git for Windows
- Links to official installer

---

## 3. GitHub API Integration

### Research Analysis

#### REST API vs GraphQL

**REST API:**
```typescript
// Create repo
POST https://api.github.com/user/repos
Body: { name: "my-repo", private: false }

// List branches
GET https://api.github.com/repos/{owner}/{repo}/branches

// Delete branch
DELETE https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}
```
- ✅ Simple, well-documented
- ✅ Sufficient for our needs
- ✅ Less overhead for simple queries
- ❌ Multiple requests for related data

**GraphQL API:**
```graphql
query {
  repository(owner: "user", name: "repo") {
    refs(refPrefix: "refs/heads/", first: 100) {
      nodes { name }
    }
  }
}
```
- ✅ Single request for complex data
- ✅ More efficient for batch operations
- ❌ More complex to implement
- ❌ Overkill for our simple operations

### 🎯 DECISION: GitHub REST API

**Library:** Octokit (official GitHub client)
```bash
npm install @octokit/rest
```

**Rationale:**
1. **Simplicity:** Our operations are straightforward
2. **Official Support:** Maintained by GitHub
3. **TypeScript Support:** Excellent type definitions
4. **Sufficient Performance:** Not doing complex queries
5. **Better Documentation:** More examples for our use cases

**Authentication:**
```typescript
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: 'github_pat_xxxxx' // From secure storage
});

// Usage
await octokit.repos.createForAuthenticatedUser({
  name: 'new-repo',
  private: false
});

await octokit.git.deleteRef({
  owner: 'username',
  repo: 'repo-name',
  ref: 'heads/feature-branch'
});
```

---

## 4. Architecture Design

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TAURI APPLICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Frontend (React + TypeScript)             │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Dashboard Component                          │   │   │
│  │  │  - Repository List                           │   │   │
│  │  │  - Status Indicators                         │   │   │
│  │  │  - Action Buttons                            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Settings Component                           │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  State Management (Zustand)                   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          │ Tauri Commands (IPC)             │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Backend (Rust)                             │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Command Handlers                             │   │   │
│  │  │  - get_repositories()                        │   │   │
│  │  │  - sync_repository()                         │   │   │
│  │  │  - add_repository()                          │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Credential Manager (Windows API)             │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Settings Storage (JSON file)                 │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          │ Spawns & Manages                 │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     Git Service (Node.js Process)                   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  simple-git wrapper                           │   │   │
│  │  │  - checkStatus(path)                         │   │   │
│  │  │  - pushLocal(path)                           │   │   │
│  │  │  - mergeBranches(path)                       │   │   │
│  │  │  - fullSync(path)                            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  GitHub API Client (Octokit)                  │   │   │
│  │  │  - createRepo()                              │   │   │
│  │  │  - deleteBranch()                            │   │   │
│  │  │  - listBranches()                            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

```
User clicks "Push Local"
    ↓
React dispatches action
    ↓
Tauri invoke command: push_local(repo_id)
    ↓
Rust handler receives command
    ↓
Rust sends IPC message to Node.js Git Service
    ↓
Git Service executes: git add . → git commit → git push
    ↓
Returns result to Rust
    ↓
Rust returns result to React
    ↓
React updates UI (success toast, status refresh)
```

---

## 5. Detailed Tech Stack

### Frontend Stack

**Core Framework:**
```json
{
  "react": "^18.2.0",
  "typescript": "^5.0.0",
  "vite": "^5.0.0"
}
```

**UI Components & Styling:**
```json
{
  "tailwindcss": "^3.4.0",
  "@headlessui/react": "^1.7.0",  // Accessible components
  "lucide-react": "^0.300.0",      // Icons
  "react-hot-toast": "^2.4.0"      // Notifications
}
```

**State Management:**
```json
{
  "zustand": "^4.4.0"  // Simple, performant state management
}
```

**Why Zustand over Redux/Context:**
- Minimal boilerplate
- Excellent TypeScript support
- Perfect for this scale
- Easy async actions

**Example Store:**
```typescript
interface AppState {
  repositories: Repository[];
  settings: AppSettings;
  
  addRepository: (repo: Repository) => void;
  updateRepositoryStatus: (id: string, status: Status) => void;
  syncRepository: (id: string, action: SyncAction) => Promise<void>;
}

const useStore = create<AppState>((set, get) => ({
  repositories: [],
  settings: defaultSettings,
  
  addRepository: (repo) => set((state) => ({
    repositories: [...state.repositories, repo]
  })),
  
  syncRepository: async (id, action) => {
    // Call Tauri command
    const result = await invoke('sync_repository', { id, action });
    // Update state
    set((state) => ({
      repositories: state.repositories.map(r =>
        r.id === id ? { ...r, status: result.status } : r
      )
    }));
  }
}));
```

### Backend Stack (Rust)

**Core Dependencies:**
```toml
[dependencies]
tauri = { version = "1.5", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
anyhow = "1.0"  # Error handling

# Windows Credential Manager
windows = { version = "0.52", features = ["Security_Credentials"] }

# File system operations
walkdir = "2.4"

# Configuration
config = "0.13"
```

**Project Structure:**
```
src-tauri/
├── src/
│   ├── main.rs                    # Entry point
│   ├── commands.rs                # Tauri command handlers
│   ├── git_service.rs             # Node.js process manager
│   ├── credentials.rs             # Windows Credential Manager
│   ├── config.rs                  # Settings management
│   └── models.rs                  # Data structures
├── Cargo.toml
└── tauri.conf.json
```

### Git Service (Node.js)

**Dependencies:**
```json
{
  "simple-git": "^3.21.0",
  "@octokit/rest": "^20.0.2",
  "dotenv": "^16.3.1"
}
```

**Project Structure:**
```
git-service/
├── src/
│   ├── index.ts                   # IPC server
│   ├── git-operations.ts          # Git commands
│   ├── github-api.ts              # GitHub operations
│   ├── types.ts                   # Shared types
│   └── utils.ts                   # Helpers
├── package.json
└── tsconfig.json
```

---

## 6. Data Models (TypeScript)

### Core Types

```typescript
// Repository model
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

// Status information
interface RepositoryStatus {
  isGitRepo: boolean;
  hasRemote: boolean;
  
  // Local state
  uncommittedFiles: number;
  untrackedFiles: number;
  modifiedFiles: string[];
  
  // Remote state
  unpushedCommits: number;
  remoteBranches: string[];
  
  // Sync state
  syncStatus: 'synced' | 'local_changes' | 'remote_branches' | 'both' | 'not_connected';
  lastChecked: Date;
  lastSynced: Date | null;
}

// Repository settings
interface RepositorySettings {
  defaultBranch: string;
  autoSync: boolean;
  excludeFromBatch: boolean;
}

// Operation log
interface OperationLog {
  id: string;
  timestamp: Date;
  action: 'push_local' | 'merge_branches' | 'full_sync' | 'add_to_github' | 'check_status';
  result: 'success' | 'error' | 'partial';
  message: string;
  details?: string;
}

// Application settings
interface AppSettings {
  github: GitHubSettings;
  scanning: ScanSettings;
  ui: UISettings;
}

interface GitHubSettings {
  username: string;
  hasToken: boolean;  // Don't store actual token in state
}

interface ScanSettings {
  directories: string[];
  depth: number;
  excludePatterns: string[];
}

interface UISettings {
  theme: 'light' | 'dark' | 'system';
  refreshInterval: number;  // 0 = manual only
  showNotifications: boolean;
}
```

### Sync Operations

```typescript
type SyncAction = 
  | { type: 'push_local' }
  | { type: 'merge_branches', branches: string[] }
  | { type: 'full_sync' };

interface SyncResult {
  success: boolean;
  message: string;
  details: {
    committed?: number;
    pushed?: number;
    merged?: string[];
    deleted?: string[];
    errors?: string[];
  };
  newStatus: RepositoryStatus;
}
```

---

## 7. Critical Implementation Details

### Git Operations Implementation

```typescript
// git-operations.ts
import simpleGit, { SimpleGit } from 'simple-git';

export class GitOperations {
  private git: SimpleGit;
  
  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }
  
  async checkStatus(): Promise<StatusInfo> {
    const status = await this.git.status();
    const branches = await this.git.branch(['-r']);
    
    // Filter out main/master from remote branches
    const remoteBranches = Object.keys(branches.branches)
      .filter(b => b.startsWith('origin/'))
      .map(b => b.replace('origin/', ''))
      .filter(b => !['main', 'master'].includes(b));
    
    return {
      uncommittedFiles: status.files.length,
      untrackedFiles: status.not_added.length,
      modifiedFiles: status.files.map(f => f.path),
      unpushedCommits: status.ahead,
      remoteBranches,
    };
  }
  
  async pushLocal(): Promise<void> {
    // Stage all changes
    await this.git.add('.');
    
    // Commit with timestamp
    const message = `Auto-sync: ${new Date().toISOString()}`;
    await this.git.commit(message);
    
    // Push to main
    await this.git.push('origin', 'main');
  }
  
  async mergeBranches(branches: string[]): Promise<string[]> {
    const merged: string[] = [];
    
    // Fetch all remotes
    await this.git.fetch('origin');
    
    for (const branch of branches) {
      try {
        // Checkout branch
        await this.git.checkout(branch);
        
        // Switch back to main
        await this.git.checkout('main');
        
        // Merge with no-ff (preserve history)
        await this.git.merge([branch, '--no-ff', '-m', `Merge branch '${branch}'`]);
        
        // Push updated main
        await this.git.push('origin', 'main');
        
        // Delete remote branch
        await this.git.push(['origin', '--delete', branch]);
        
        // Delete local branch
        await this.git.branch(['-d', branch]);
        
        merged.push(branch);
      } catch (error) {
        console.error(`Failed to merge ${branch}:`, error);
        // Continue with other branches
      }
    }
    
    return merged;
  }
  
  async fullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      committed: 0,
      merged: [],
      errors: []
    };
    
    // Check if there are local changes
    const status = await this.git.status();
    if (status.files.length > 0) {
      try {
        await this.pushLocal();
        result.committed = status.files.length;
      } catch (error) {
        result.errors.push(`Push failed: ${error.message}`);
      }
    }
    
    // Check for remote branches
    const branches = await this.git.branch(['-r']);
    const remoteBranches = Object.keys(branches.branches)
      .filter(b => b.startsWith('origin/'))
      .map(b => b.replace('origin/', ''))
      .filter(b => !['main', 'master'].includes(b));
    
    if (remoteBranches.length > 0) {
      try {
        const merged = await this.mergeBranches(remoteBranches);
        result.merged = merged;
      } catch (error) {
        result.errors.push(`Merge failed: ${error.message}`);
      }
    }
    
    return result;
  }
}
```

### GitHub API Operations

```typescript
// github-api.ts
import { Octokit } from '@octokit/rest';

export class GitHubAPI {
  private octokit: Octokit;
  
  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }
  
  async createRepository(name: string, isPrivate: boolean): Promise<string> {
    const response = await this.octokit.repos.createForAuthenticatedUser({
      name,
      private: isPrivate,
      auto_init: false
    });
    
    return response.data.clone_url;
  }
  
  async listBranches(owner: string, repo: string): Promise<string[]> {
    const response = await this.octokit.repos.listBranches({
      owner,
      repo
    });
    
    return response.data
      .map(b => b.name)
      .filter(name => !['main', 'master'].includes(name));
  }
  
  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
  }
}
```

### Windows Credential Storage (Rust)

```rust
// credentials.rs
use windows::Security::Credentials::{PasswordCredential, PasswordVault};
use anyhow::{Result, Context};

const CREDENTIAL_RESOURCE: &str = "BitGit_GitHub_Token";

pub struct CredentialManager {
    vault: PasswordVault,
}

impl CredentialManager {
    pub fn new() -> Result<Self> {
        let vault = PasswordVault::new()
            .context("Failed to access Windows Credential Manager")?;
        Ok(Self { vault })
    }
    
    pub fn save_token(&self, username: &str, token: &str) -> Result<()> {
        let credential = PasswordCredential::CreatePasswordCredential(
            CREDENTIAL_RESOURCE,
            username,
            token
        )?;
        
        self.vault.Add(&credential)?;
        Ok(())
    }
    
    pub fn get_token(&self, username: &str) -> Result<String> {
        let credential = self.vault.Retrieve(CREDENTIAL_RESOURCE, username)?;
        credential.RetrievePassword()?;
        
        let password = credential.Password()?.to_string();
        Ok(password)
    }
    
    pub fn delete_token(&self, username: &str) -> Result<()> {
        let credential = self.vault.Retrieve(CREDENTIAL_RESOURCE, username)?;
        self.vault.Remove(&credential)?;
        Ok(())
    }
}
```

### Repository Scanner (Rust)

```rust
// scanner.rs
use walkdir::WalkDir;
use std::path::PathBuf;

pub struct RepositoryScanner {
    directories: Vec<PathBuf>,
    max_depth: usize,
    exclude_patterns: Vec<String>,
}

impl RepositoryScanner {
    pub fn scan(&self) -> Vec<PathBuf> {
        let mut repos = Vec::new();
        
        for dir in &self.directories {
            let walker = WalkDir::new(dir)
                .max_depth(self.max_depth)
                .follow_links(false);
            
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                
                // Check if directory contains .git
                if path.join(".git").exists() {
                    // Check against exclude patterns
                    if !self.is_excluded(path) {
                        repos.push(path.to_path_buf());
                    }
                }
            }
        }
        
        repos
    }
    
    fn is_excluded(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();
        self.exclude_patterns.iter()
            .any(|pattern| path_str.contains(pattern))
    }
}
```

---

## 8. UI Component Architecture

### Component Tree

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── SearchBar
│   │   └── SettingsButton
│   ├── Sidebar (Future: filters, groups)
│   └── Main
│       ├── RepositoryList
│       │   └── RepositoryCard (repeated)
│       │       ├── StatusIndicator
│       │       ├── RepoInfo
│       │       ├── StatusDetails
│       │       └── ActionButtons
│       │           ├── PushLocalButton
│       │           ├── MergeBranchesButton
│       │           ├── FullSyncButton
│       │           └── OpenVSCodeButton
│       └── EmptyState
├── Modals
│   ├── AddRepositoryModal
│   ├── SettingsModal
│   └── ConfirmationModal
└── Toaster (react-hot-toast)
```

### Key Components

```typescript
// RepositoryCard.tsx
interface RepositoryCardProps {
  repository: Repository;
  onSync: (id: string, action: SyncAction) => Promise<void>;
  onOpenVSCode: (path: string) => void;
}

export function RepositoryCard({ repository, onSync, onOpenVSCode }: RepositoryCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  
  const handleAction = async (action: SyncAction) => {
    setLoading(action.type);
    try {
      await onSync(repository.id, action);
      toast.success(`${action.type} completed successfully`);
    } catch (error) {
      toast.error(`${action.type} failed: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4" 
         style={{ borderColor: getStatusColor(repository.status.syncStatus) }}>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <StatusIndicator status={repository.status.syncStatus} />
          <div>
            <h3 className="font-semibold text-lg">{repository.name}</h3>
            <p className="text-sm text-gray-500">{repository.localPath}</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-1 mb-4 text-sm">
        {repository.status.uncommittedFiles > 0 && (
          <div className="text-yellow-600">
            • {repository.status.uncommittedFiles} uncommitted files
          </div>
        )}
        {repository.status.remoteBranches.length > 0 && (
          <div className="text-orange-600">
            • {repository.status.remoteBranches.length} remote branches ({repository.status.remoteBranches.join(', ')})
          </div>
        )}
        <div className="text-gray-500">
          Last synced: {formatRelativeTime(repository.status.lastSynced)}
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button
          onClick={() => handleAction({ type: 'push_local' })}
          disabled={repository.status.uncommittedFiles === 0 || loading !== null}
          loading={loading === 'push_local'}
          variant="primary"
        >
          Push Local
        </Button>
        
        <Button
          onClick={() => handleAction({ type: 'merge_branches', branches: repository.status.remoteBranches })}
          disabled={repository.status.remoteBranches.length === 0 || loading !== null}
          loading={loading === 'merge_branches'}
          variant="secondary"
        >
          Merge Remote
        </Button>
        
        <Button
          onClick={() => handleAction({ type: 'full_sync' })}
          disabled={loading !== null}
          loading={loading === 'full_sync'}
          variant="accent"
        >
          Full Sync
        </Button>
        
        <Button
          onClick={() => onOpenVSCode(repository.localPath)}
          variant="ghost"
          icon={<Code size={16} />}
        >
          VS Code
        </Button>
      </div>
    </div>
  );
}
```

---

## 9. Performance Optimization Strategy

### Parallel Status Checking

```typescript
// Efficient status checking for multiple repos
async function checkAllRepositories(repos: Repository[]): Promise<Map<string, RepositoryStatus>> {
  const results = new Map();
  
  // Batch in groups of 10 to avoid overwhelming system
  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        try {
          const status = await invoke('check_repo_status', { path: repo.localPath });
          return [repo.id, status];
        } catch (error) {
          console.error(`Failed to check ${repo.name}:`, error);
          return [repo.id, null];
        }
      })
    );
    
    batchResults.forEach(([id, status]) => {
      if (status) results.set(id, status);
    });
  }
  
  return results;
}
```

### Status Caching

```typescript
// Cache status for 30 seconds to avoid redundant checks
interface CachedStatus {
  status: RepositoryStatus;
  timestamp: number;
}

class StatusCache {
  private cache = new Map<string, CachedStatus>();
  private ttl = 30000; // 30 seconds
  
  get(repoId: string): RepositoryStatus | null {
    const cached = this.cache.get(repoId);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.ttl) {
      this.cache.delete(repoId);
      return null;
    }
    
    return cached.status;
  }
  
  set(repoId: string, status: RepositoryStatus): void {
    this.cache.set(repoId, {
      status,
      timestamp: Date.now()
    });
  }
  
  invalidate(repoId: string): void {
    this.cache.delete(repoId);
  }
}
```

### Optimistic UI Updates

```typescript
// Update UI immediately, then sync with actual state
async function syncRepository(id: string, action: SyncAction) {
  // Optimistically update UI
  updateRepositoryStatus(id, { isLoading: true });
  
  try {
    const result = await invoke('sync_repository', { id, action });
    
    // Update with actual result
    updateRepositoryStatus(id, result.newStatus);
    
    return result;
  } catch (error) {
    // Revert optimistic update
    await refreshRepositoryStatus(id);
    throw error;
  }
}
```

---

## 10. Error Handling Strategy

### Error Categories

```typescript
enum ErrorCategory {
  NETWORK = 'network',
  AUTH = 'auth',
  GIT = 'git',
  FILESYSTEM = 'filesystem',
  GITHUB_API = 'github_api'
}

interface AppError {
  category: ErrorCategory;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
}
```

### Error Handlers

```typescript
// Network errors
function handleNetworkError(error: Error): AppError {
  return {
    category: ErrorCategory.NETWORK,
    message: 'Network connection failed',
    details: error.message,
    recoverable: true,
    suggestedAction: 'Check your internet connection and try again'
  };
}

// Git errors
function handleGitError(error: Error): AppError {
  if (error.message.includes('not a git repository')) {
    return {
      category: ErrorCategory.GIT,
      message: 'Not a Git repository',
      recoverable: false,
      suggestedAction: 'Remove this directory from tracking'
    };
  }
  
  if (error.message.includes('merge conflict')) {
    return {
      category: ErrorCategory.GIT,
      message: 'Merge conflict detected',
      recoverable: true,
      suggestedAction: 'Open in VS Code to resolve conflicts manually'
    };
  }
  
  return {
    category: ErrorCategory.GIT,
    message: 'Git operation failed',
    details: error.message,
    recoverable: true,
    suggestedAction: 'Check the repository status and try again'
  };
}

// GitHub API errors
function handleGitHubError(error: any): AppError {
  if (error.status === 401) {
    return {
      category: ErrorCategory.AUTH,
      message: 'GitHub authentication failed',
      details: 'Your Personal Access Token may be invalid or expired',
      recoverable: true,
      suggestedAction: 'Update your GitHub token in settings'
    };
  }
  
  if (error.status === 404) {
    return {
      category: ErrorCategory.GITHUB_API,
      message: 'Repository not found on GitHub',
      recoverable: false,
      suggestedAction: 'The repository may have been deleted'
    };
  }
  
  return {
    category: ErrorCategory.GITHUB_API,
    message: 'GitHub API error',
    details: error.message,
    recoverable: true,
    suggestedAction: 'Try again in a moment'
  };
}
```

### User-Facing Error Display

```typescript
function showError(error: AppError) {
  toast.error(
    <div>
      <div className="font-semibold">{error.message}</div>
      {error.details && (
        <div className="text-sm mt-1">{error.details}</div>
      )}
      {error.suggestedAction && (
        <div className="text-sm mt-2 text-blue-600">{error.suggestedAction}</div>
      )}
    </div>,
    { duration: error.recoverable ? 5000 : 10000 }
  );
}
```

---

## 11. Security Implementation

### GitHub Token Storage (Windows)

```rust
// Secure token handling
#[tauri::command]
async fn save_github_token(username: String, token: String) -> Result<(), String> {
    let cred_manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;
    
    // Validate token format
    if !token.starts_with("ghp_") && !token.starts_with("github_pat_") {
        return Err("Invalid GitHub token format".to_string());
    }
    
    cred_manager.save_token(&username, &token)
        .map_err(|e| format!("Failed to save token: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn get_github_token(username: String) -> Result<String, String> {
    let cred_manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;
    
    cred_manager.get_token(&username)
        .map_err(|e| format!("Failed to retrieve token: {}", e))
}
```

### Configuration Security

```rust
// Store settings without sensitive data
#[derive(Serialize, Deserialize)]
struct SafeSettings {
    github_username: String,
    // Never store token here
    scan_directories: Vec<String>,
    ui_preferences: UIPreferences,
}

// Settings file location
fn get_config_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").expect("APPDATA not found");
    Path::new(&app_data)
        .join("BitGit")
        .join("settings.json")
}
```

### Git Safety Rules

```typescript
// Never force push
async function safePush(git: SimpleGit) {
  // Always use regular push
  await git.push('origin', 'main');
  
  // Never do:
  // await git.push('origin', 'main', ['--force']);
}

// Always preserve history
async function safeMerge(git: SimpleGit, branch: string) {
  // Use --no-ff to preserve branch history
  await git.merge([branch, '--no-ff', '-m', `Merge branch '${branch}'`]);
  
  // Never do:
  // await git.merge([branch, '--ff-only']); // Loses history
}
```

---

## 12. Build & Deployment

### Development Setup

```bash
# Prerequisites
- Node.js 18+ (for Git service)
- Rust 1.70+ (for Tauri)
- Git for Windows
- Visual Studio Build Tools (for native dependencies)

# Project initialization
npm create tauri-app@latest
# Choose: React + TypeScript

# Install dependencies
cd bitgit
npm install
cd git-service && npm install && cd ..

# Development
npm run tauri dev
```

### Build Configuration

```json
// tauri.conf.json
{
  "package": {
    "productName": "BitGit",
    "version": "0.1.0"
  },
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "open": true
      },
      "fs": {
        "readDir": true,
        "readFile": true,
        "scope": ["$APPDATA/BitGit/*"]
      }
    },
    "bundle": {
      "active": true,
      "targets": ["nsis"],
      "identifier": "com.bitgit.app",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.ico"
      ],
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": ""
      }
    },
    "windows": [
      {
        "title": "BitGit",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

### Production Build

```bash
# Build for Windows
npm run tauri build

# Output:
# src-tauri/target/release/bundle/nsis/BitGit_0.1.0_x64-setup.exe
```

### Installer Features

```nsis
; NSIS installer options
- Install Git for Windows if not present
- Create desktop shortcut
- Add to Start Menu
- Option to run on startup
- Clean uninstall
```

---

## 13. Testing Strategy

### Unit Tests

```typescript
// Git operations tests
describe('GitOperations', () => {
  test('should detect uncommitted changes', async () => {
    const git = new GitOperations('/path/to/test/repo');
    const status = await git.checkStatus();
    expect(status.uncommittedFiles).toBeGreaterThan(0);
  });
  
  test('should push local changes', async () => {
    const git = new GitOperations('/path/to/test/repo');
    await git.pushLocal();
    const status = await git.checkStatus();
    expect(status.uncommittedFiles).toBe(0);
  });
});
```

### Integration Tests

```typescript
// End-to-end sync test
test('full sync workflow', async () => {
  // Setup: Create test repo with local changes and remote branch
  const testRepo = await createTestRepository();
  
  // Execute full sync
  const result = await syncRepository(testRepo.id, { type: 'full_sync' });
  
  // Verify: Everything is synced
  expect(result.success).toBe(true);
  expect(result.details.committed).toBeGreaterThan(0);
  expect(result.details.merged?.length).toBeGreaterThan(0);
  
  // Check final status
  const status = await checkStatus(testRepo.id);
  expect(status.syncStatus).toBe('synced');
});
```

### Manual Testing Checklist

```
[ ] Add new repository to GitHub
[ ] Push local changes
[ ] Merge remote branches
[ ] Full sync with both local and remote changes
[ ] Handle network failure during sync
[ ] Handle invalid GitHub token
[ ] Handle missing Git installation
[ ] Handle corrupted repository
[ ] Check 50 repos simultaneously
[ ] Verify credential storage/retrieval
[ ] Test on clean Windows installation
```

---

## 14. Development Roadmap

### Phase 1: Foundation (Week 1)

**Day 1-2: Project Setup**
- [ ] Initialize Tauri project
- [ ] Set up React + TypeScript + Tailwind
- [ ] Create Git service Node.js project
- [ ] Configure build pipeline

**Day 3-4: Core Backend**
- [ ] Implement Rust command handlers
- [ ] Set up IPC communication with Node.js
- [ ] Implement Windows Credential Manager integration
- [ ] Create settings storage system

**Day 5-7: Git Operations**
- [ ] Implement simple-git wrapper
- [ ] Build status checking
- [ ] Implement push local
- [ ] Implement merge branches
- [ ] Implement full sync

### Phase 2: GitHub Integration (Week 2)

**Day 8-9: GitHub API**
- [ ] Set up Octokit client
- [ ] Implement create repository
- [ ] Implement list branches
- [ ] Implement delete branch

**Day 10-11: Repository Management**
- [ ] Build repository scanner
- [ ] Implement repository detection
- [ ] Create data persistence layer

**Day 12-14: Authentication**
- [ ] Build GitHub auth flow
- [ ] Implement token validation
- [ ] Handle token expiry

### Phase 3: UI Development (Week 3)

**Day 15-16: Dashboard**
- [ ] Build repository list
- [ ] Create repository cards
- [ ] Implement status indicators

**Day 17-18: Actions**
- [ ] Build action buttons
- [ ] Implement loading states
- [ ] Add operation feedback (toasts)

**Day 19-20: Settings**
- [ ] Create settings modal
- [ ] Build directory configuration
- [ ] Implement GitHub auth UI

**Day 21: Polish**
- [ ] Add empty states
- [ ] Improve error messages
- [ ] Refine styling

### Phase 4: Testing & Release (Week 4)

**Day 22-23: Testing**
- [ ] Write unit tests
- [ ] Perform integration testing
- [ ] Manual testing on fresh Windows

**Day 24-25: Bug Fixes**
- [ ] Fix critical issues
- [ ] Handle edge cases
- [ ] Improve error handling

**Day 26-27: Documentation**
- [ ] Write user guide
- [ ] Create setup instructions
- [ ] Document GitHub token creation

**Day 28: Release**
- [ ] Build production installer
- [ ] Create release notes
- [ ] Distribute MVP

---

## 15. Risk Mitigation

### High-Risk Areas

**1. Git Merge Conflicts**
- **Risk:** Even solo dev can create conflicts
- **Mitigation:** 
  - Detect conflicts before merge
  - Show clear error with conflicted files
  - Open VS Code to resolve
  - Don't auto-merge conflicted branches

**2. Network Failures During Sync**
- **Risk:** Partial sync leaves inconsistent state
- **Mitigation:**
  - Atomic operations where possible
  - Transaction-like rollback on failure
  - Clear error messages
  - Retry mechanism

**3. Credential Security**
- **Risk:** Token exposure or loss
- **Mitigation:**
  - Windows Credential Manager (encrypted)
  - Never log tokens
  - Validate token on every use
  - Easy token rotation

**4. Repository Corruption**
- **Risk:** .git folder issues break operations
- **Mitigation:**
  - Validate repo health before operations
  - Catch and handle git errors gracefully
  - Offer repair suggestions
  - Allow manual removal from tracking

**5. Performance with 50 Repos**
- **Risk:** Slow status checks, UI freezes
- **Mitigation:**
  - Parallel checking (batched)
  - Status caching (30s TTL)
  - Background checking
  - Progressive loading

---

## 16. Future Enhancements (Post-MVP)

### Phase 2 Features

**Repository Grouping**
- Group repos by project/client/tech stack
- Batch operations per group

**Advanced Filters**
- Filter by sync status
- Filter by last activity
- Search by name/path

**Operation History**
- View detailed logs
- Filter by date/action
- Export logs

**Custom Commit Messages**
- Template support
- Per-repo defaults
- Emoji support 🚀

**Conflict Resolution UI**
- Visual diff viewer
- Three-way merge helper
- Keep local/remote buttons

### Phase 3 Features

**Auto-Sync Mode**
- Watch for file changes
- Auto-sync on save
- Configurable per repo

**Notifications**
- Desktop notifications
- Sync completion alerts
- Error notifications

**CLI Companion**
- `bitgit sync all`
- `bitgit status`
- Scriptable automation

**VS Code Extension**
- Open repo from VS Code
- Trigger sync from editor
- Status bar indicator

**Advanced Settings**
- Custom Git commands
- Pre/post-sync hooks
- Branch naming patterns

---

## 17. Final Technology Lock-In

### ✅ Confirmed Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state)
- react-hot-toast (notifications)
- Headless UI (accessible components)
- Lucide React (icons)

**Backend:**
- Tauri 1.5 (Rust)
- Windows Credential Manager (credentials)
- JSON file (settings)

**Git Service:**
- Node.js 18+
- simple-git 3.x
- @octokit/rest 20.x

**Development:**
- TypeScript 5
- ESLint + Prettier
- Jest (testing)
- Cargo (Rust build)

**Deployment:**
- NSIS installer (Windows)
- Single executable
- Auto-update capability (future)

---

## 18. Implementation Handoff Document

### For the Implementation Coder

You now have:

1. **Complete architecture** - Tauri + React + Node.js Git service
2. **Locked technology choices** - All libraries and frameworks decided
3. **Detailed data models** - TypeScript interfaces for all entities
4. **Implementation examples** - Code snippets for core features
5. **Clear roadmap** - 4-week development plan
6. **Risk mitigation** - Known issues and solutions
7. **Testing strategy** - What to test and how

### Critical Path

```
Week 1: Get Git operations working
Week 2: Connect to GitHub API
Week 3: Build the UI
Week 4: Test and release MVP
```

### Key Success Metrics

- [ ] Dashboard loads in <500ms
- [ ] Sync operation completes in <10s
- [ ] Handles 20 repos smoothly
- [ ] Zero credential exposure
- [ ] Clear error messages
- [ ] Professional UI/UX

### Start Here

1. Initialize Tauri project: `npm create tauri-app@latest`
2. Set up Git service: Create Node.js project in `/git-service`
3. Install dependencies from tech stack
4. Implement `GitOperations` class first (Week 1 priority)
5. Build basic Tauri commands for IPC
6. Create React dashboard shell

---

## 📋 Summary

**We're building:** A Windows desktop app that syncs local Git repos with GitHub using a visual dashboard and one-click actions.

**Core tech:** Tauri (Rust) + React (TypeScript) + Node.js (simple-git + Octokit)

**Why this stack:** Native performance, modern UI, best Git/GitHub libraries, secure credential storage, small footprint.

**Key features:** Push local changes, merge remote branches, full sync, add new repos, visual status dashboard.

**Next step:** Begin implementation following Week 1 roadmap.

---
