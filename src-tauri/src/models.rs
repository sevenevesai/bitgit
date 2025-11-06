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
    PushLocal,
    MergeBranches { branches: Vec<String> },
    PullBranches { branches: Vec<String> },
    FullSync,
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
