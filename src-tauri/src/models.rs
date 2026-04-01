use serde::{Deserialize, Serialize};

// Main Project struct - can have GitHub, Local, both, or neither
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,

    // GitHub (optional)
    pub github_owner: Option<String>,
    pub github_repo: Option<String>,
    pub github_url: Option<String>,

    // Local (optional)
    pub local_path: Option<String>,

    // Overall project state
    pub project_status: ProjectStatus,

    // Git status (only when both GitHub and Local are linked)
    pub git_status: Option<GitStatus>,

    // Timestamps
    pub created_at: String,
    pub last_synced: Option<String>,

    // Priority 3: Project Management Features
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statistics: Option<ProjectStatistics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
}

// Overall project configuration state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    NotConfigured,    // Neither GitHub nor Local
    GithubOnly,       // Has GitHub, no Local
    LocalOnly,        // Has Local, no GitHub
    Ready,            // Both linked, needs status check
    Synced,           // Both linked, everything in sync
    NeedsPush,        // Both linked, has local changes
    NeedsMerge,       // Both linked, has remote branches
    NeedsSync,        // Both linked, has both issues
}

// Git status for fully configured projects
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_git_repo: bool,
    pub has_remote: bool,
    pub uncommitted_files: u32,
    pub untracked_files: u32,
    pub modified_files: Vec<String>,
    pub unpushed_commits: u32,
    pub remote_branches: Vec<String>,
    pub sync_status: SyncStatus,
    pub last_checked: String,
}

// Legacy type aliases for compatibility
pub type Repository = Project;
pub type RepositoryStatus = GitStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    Synced,
    LocalChanges,
    RemoteBranches,
    Both,
    NotConnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncAction {
    PushLocal {
        #[serde(default, rename = "commitMessage")]
        commit_message: Option<String>,
        #[serde(default, rename = "commitDescription")]
        commit_description: Option<String>,
    },
    MergeBranches { branches: Vec<String> },
    PullBranches { branches: Vec<String> },
    FullSync {
        #[serde(default, rename = "commitMessage")]
        commit_message: Option<String>,
        #[serde(default, rename = "commitDescription")]
        commit_description: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub details: SyncDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDetails {
    pub committed: Option<u32>,
    pub pushed: Option<u32>,
    pub merged: Option<Vec<String>>,
    pub deleted: Option<Vec<String>>,
    pub errors: Option<Vec<String>>,
}

// Project Management (Priority 3)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatistics {
    pub total_syncs: u32,
    pub total_commits: u32,
    pub total_pushes: u32,
    pub total_merges: u32,
    pub total_pulls: u32,
    pub last_sync_date: Option<String>,
    pub last_commit_date: Option<String>,
}

// Pre-sync validation types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreSyncValidation {
    pub can_proceed: bool,
    pub has_warnings: bool,
    pub total_staged_size: u64,
    pub total_staged_size_mb: f64,
    pub issues: Vec<FileValidationIssue>,
    pub suggested_gitignore: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileValidationIssue {
    pub file_path: String,
    pub severity: ValidationSeverity,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_mb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gitignore_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ValidationSeverity {
    Error,
    Warning,
    Info,
}
