// Core data models for BitGit

// Main Project interface - can have GitHub, Local, both, or neither
export interface Project {
  id: string;
  name: string;

  // GitHub (optional)
  githubOwner: string | null;
  githubRepo: string | null;
  githubUrl: string | null;

  // Local (optional)
  localPath: string | null;

  // Overall project state
  projectStatus: ProjectStatus;

  // Git status (only when both GitHub and Local are linked)
  gitStatus: GitStatus | null;

  // Timestamps
  createdAt: string;
  lastSynced: string | null;

  // Priority 3: Project Management Features
  description?: string | null;          // Project notes/description
  archived?: boolean;                   // Archive status (hide without deleting)
  favorite?: boolean;                   // Pinned/favorited projects
  lastActivity?: string | null;         // Last activity timestamp
  statistics?: ProjectStatistics | null; // Usage statistics
  template?: string | null;             // Template used to initialize
}

// Overall project configuration state
export type ProjectStatus =
  | 'not_configured'     // Neither GitHub nor Local
  | 'github_only'        // Has GitHub, no Local
  | 'local_only'         // Has Local, no GitHub
  | 'ready'              // Both linked, needs status check
  | 'synced'             // Both linked, everything in sync
  | 'needs_push'         // Both linked, has local changes
  | 'needs_merge'        // Both linked, has remote branches
  | 'needs_sync';        // Both linked, has both issues

// Git status for fully configured projects
export interface GitStatus {
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
  lastChecked: string;
}

// Legacy type alias for compatibility
export type Repository = Project;
export type RepositoryStatus = GitStatus;

export interface RepositorySettings {
  defaultBranch: string;
  autoSync: boolean;
  excludeFromBatch: boolean;
}

export interface OperationLog {
  id: string;
  timestamp: Date;
  action: 'push_local' | 'merge_branches' | 'full_sync' | 'add_to_github' | 'check_status';
  result: 'success' | 'error' | 'partial';
  message: string;
  details?: string;
}

export type SyncAction =
  | { type: 'push_local'; commitMessage?: string; commitDescription?: string }
  | { type: 'merge_branches'; branches: string[] }
  | { type: 'pull_branches'; branches: string[] }
  | { type: 'full_sync'; commitMessage?: string; commitDescription?: string };

export interface SyncResult {
  success: boolean;
  message: string;
  details: {
    committed?: number;
    pushed?: number;
    merged?: string[];
    deleted?: string[];
    errors?: string[];
  };
  newStatus?: RepositoryStatus;
}

export interface AppSettings {
  github: GitHubSettings;
  scanning: ScanSettings;
  ui: UISettings;
}

export interface GitHubSettings {
  username: string;
  hasToken: boolean;
}

export interface ScanSettings {
  directories: string[];
  depth: number;
  excludePatterns: string[];
}

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  refreshInterval: number;
  showNotifications: boolean;
}

// Advanced Git Features Types
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

// Project Management Types (Priority 3)
export interface ProjectStatistics {
  totalSyncs: number;
  totalCommits: number;
  totalPushes: number;
  totalMerges: number;
  totalPulls: number;
  lastSyncDate: string | null;
  lastCommitDate: string | null;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  gitignore: string;
  readme?: string;
  additionalFiles?: { path: string; content: string }[];
}

// Priority 6: Performance & Reliability Types
export interface QueuedOperation {
  id: string;
  projectId: string;
  projectName: string;
  action: SyncAction;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface OperationQueueState {
  queue: QueuedOperation[];
  isProcessing: boolean;
  maxConcurrent: number;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

// ===== Priority 1: Dashboard Analytics & Insights Types =====

// Dashboard Overview Panel
export interface DashboardOverview {
  totalProjects: number;
  activeProjects: number;          // Recently synced
  needsAttention: number;           // Has uncommitted changes or pending PRs

  // Time-based commit counts
  commitsToday: number;
  commitsThisWeek: number;
  commitsThisMonth: number;

  // Aggregate stats
  totalBranches: number;
  totalStashes: number;
  totalTags: number;

  // Most active project
  mostActiveProject: {
    id: string;
    name: string;
    commitCount: number;
  } | null;
}

// Activity Timeline Entry
export interface ActivityEntry {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;            // For visual grouping

  // Commit details
  commitHash: string;
  commitMessage: string;
  author: string;
  email: string;
  date: string;                    // ISO timestamp

  // Additional context
  branch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

// Activity Timeline with filtering
export interface ActivityTimeline {
  entries: ActivityEntry[];
  dateRange: {
    start: string;
    end: string;
  };
  totalCommits: number;
  totalProjects: number;
}

// Repository Health Indicator
export interface HealthIndicator {
  projectId: string;
  projectName: string;

  // Health metrics
  daysSinceLastCommit: number | null;
  uncommittedChangesDuration: number | null;  // Hours since first change
  staleBranches: StaleBranchInfo[];

  // Severity levels
  healthStatus: 'healthy' | 'attention' | 'warning' | 'critical';
  warnings: string[];

  // Dependencies (future enhancement)
  outdatedDependencies?: number;
}

export interface StaleBranchInfo {
  name: string;
  daysSinceLastCommit: number;
  isRemote: boolean;
}

// Contribution Heatmap
export interface ContributionHeatmap {
  // Map of date (YYYY-MM-DD) to contribution count
  dailyContributions: Record<string, DailyContribution>;

  // Date range
  startDate: string;
  endDate: string;

  // Summary stats
  totalContributions: number;
  currentStreak: number;
  longestStreak: number;

  // Most productive day
  mostProductiveDay: {
    date: string;
    count: number;
  } | null;
}

export interface DailyContribution {
  date: string;                    // YYYY-MM-DD
  count: number;                   // Number of commits
  projects: string[];              // Project IDs with activity
  level: 0 | 1 | 2 | 3 | 4;       // Intensity level (0=none, 4=most)
}

// Combined Analytics Data
export interface AnalyticsData {
  overview: DashboardOverview;
  timeline: ActivityTimeline;
  health: HealthIndicator[];
  heatmap: ContributionHeatmap;

  // Metadata
  lastUpdated: string;
  generatedAt: string;
}

// Analytics Configuration
export interface AnalyticsConfig {
  // Timeline settings
  timelineLimit: number;           // Max entries to fetch
  timelineDays: number;            // Days to look back

  // Health thresholds
  healthThresholds: {
    staleCommitDays: number;       // Days before considering stale
    uncommittedHours: number;      // Hours before warning
    staleBranchDays: number;       // Days before branch is stale
  };

  // Heatmap settings
  heatmapMonths: number;           // Months to display

  // Auto-refresh
  autoRefresh: boolean;
  refreshIntervalMinutes: number;
}

// Default analytics configuration
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  timelineLimit: 100,
  timelineDays: 30,
  healthThresholds: {
    staleCommitDays: 7,
    uncommittedHours: 24,
    staleBranchDays: 30,
  },
  heatmapMonths: 12,
  autoRefresh: true,
  refreshIntervalMinutes: 15,
};

// Predefined templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty project with no templates',
    gitignore: '',
  },
  {
    id: 'node',
    name: 'Node.js',
    description: 'Node.js project with common ignores',
    gitignore: `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
package-lock.json
yarn.lock

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store`,
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python project with virtual env ignores',
    gitignore: `# Byte-compiled / optimized
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
venv/
env/
ENV/
.venv

# Distribution / packaging
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
.DS_Store

# Testing
.pytest_cache/
.coverage
htmlcov/`,
  },
  {
    id: 'react',
    name: 'React',
    description: 'React/Vite project setup',
    gitignore: `# Dependencies
node_modules/
.pnp/
.pnp.js

# Production
/build
/dist

# Environment
.env
.env.local
.env.*.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
.DS_Store

# Testing
coverage/`,
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'Rust project with Cargo ignores',
    gitignore: `# Cargo
/target/
Cargo.lock

# IDE
.vscode/
.idea/
*.swp
.DS_Store

# OS
Thumbs.db`,
  },
  {
    id: 'java',
    name: 'Java',
    description: 'Java/Maven/Gradle project',
    gitignore: `# Compiled class files
*.class

# Package Files
*.jar
*.war
*.ear

# Maven
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup

# Gradle
.gradle/
build/

# IDE
.vscode/
.idea/
*.iml
.DS_Store`,
  },
];
