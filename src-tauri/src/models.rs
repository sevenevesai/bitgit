use serde::{Deserialize, Serialize};

// Main Project struct - can have GitHub, Local, both, or neither
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    // User labels, already normalized by `normalize_labels`. Missing on caches written before labels.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
}

pub const MAX_LABELS: usize = 8;
pub const MAX_LABEL_CHARS: usize = 24;

/// The labels to store for a project: each trimmed with inner whitespace collapsed to one space,
/// blanks dropped, and case-insensitive duplicates reduced to their first spelling. Any label that
/// is too long or uses characters other than letters, digits, spaces and hyphens rejects the whole
/// list, so a failed save never changes what is stored.
pub fn normalize_labels(input: &[String]) -> Result<Vec<String>, String> {
    let mut labels: Vec<String> = Vec::new();
    for raw in input {
        let label = raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if label.is_empty() {
            continue;
        }
        if label.chars().count() > MAX_LABEL_CHARS {
            return Err(format!("Label \"{label}\" is longer than {MAX_LABEL_CHARS} characters"));
        }
        if !label.chars().all(|c| c == ' ' || c == '-' || c.is_alphanumeric()) {
            return Err(format!("Label \"{label}\" can only use letters, numbers, spaces and hyphens"));
        }
        if !labels.iter().any(|existing| existing.to_lowercase() == label.to_lowercase()) {
            labels.push(label);
        }
    }
    if labels.len() > MAX_LABELS {
        return Err(format!("A project can have at most {MAX_LABELS} labels"));
    }
    Ok(labels)
}

// Overall project configuration state
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

// Git status for projects with a local path. Fields after `last_checked` were added
// later; `serde(default)` keeps caches written by older versions readable.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    #[serde(default)]
    pub current_branch: Option<String>,
    #[serde(default)]
    pub upstream: Option<String>,
    // Fetch URL of that remote with any credentials removed.
    #[serde(default)]
    pub remote_url: Option<String>,
    #[serde(default)]
    pub behind_commits: u32,
    // When the remote was last read successfully; never set from a failed check.
    #[serde(default)]
    pub remote_checked_at: Option<String>,
    #[serde(default)]
    pub remote_error: Option<String>,
}

// Legacy type aliases for compatibility
pub type Repository = Project;
pub type RepositoryStatus = GitStatus;

// Serialized snake_case for the UI. Pre-snake_case caches stored these lowercase
// without separators, so the old spellings stay accepted as aliases.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Synced,
    #[serde(alias = "localchanges")]
    LocalChanges,
    // No longer produced: unrelated remote branches do not make a project need a merge.
    #[serde(alias = "remotebranches")]
    RemoteBranches,
    Both,
    #[serde(alias = "notconnected")]
    NotConnected,
    Behind,
    Diverged,
    // The remote could not be read, so nothing can be claimed about sync state.
    Unavailable,
}

// `selected_files: None` means "push existing commits only" - the service never
// reads it as "stage everything".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncAction {
    PushLocal {
        #[serde(default, rename = "commitMessage")]
        commit_message: Option<String>,
        #[serde(default, rename = "commitDescription")]
        commit_description: Option<String>,
        #[serde(default, rename = "selectedFiles")]
        selected_files: Option<Vec<String>>,
        #[serde(default, rename = "allowWarnings")]
        allow_warnings: bool,
    },
    MergeBranches { branches: Vec<String> },
    PullBranches { branches: Vec<String> },
    FullSync {
        #[serde(default, rename = "commitMessage")]
        commit_message: Option<String>,
        #[serde(default, rename = "commitDescription")]
        commit_description: Option<String>,
        #[serde(default, rename = "selectedFiles")]
        selected_files: Option<Vec<String>>,
        #[serde(default, rename = "allowWarnings")]
        allow_warnings: bool,
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
    pub pulled: Option<u32>,
    pub merged: Option<Vec<String>>,
    pub deleted: Option<Vec<String>>,
    pub errors: Option<Vec<String>>,
}

// Project Management (Priority 3)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    #[serde(alias = "totalStagedSizeMB")]
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
    #[serde(alias = "sizeMB")]
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

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    #[test]
    fn labels_are_trimmed_collapsed_and_deduplicated_by_first_spelling() {
        let labels = normalize_labels(&strings(&["  Work  ", "work", "client   one", "工作", "  ", "v2-beta"])).unwrap();
        assert_eq!(labels, strings(&["Work", "client one", "工作", "v2-beta"]));
        assert_eq!(normalize_labels(&[]).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn invalid_labels_reject_the_whole_list() {
        assert!(normalize_labels(&strings(&["ok", "bad!"])).unwrap_err().contains("letters"));
        assert!(normalize_labels(&strings(&["<script>"])).is_err());
        assert!(normalize_labels(&strings(&["tab\there"])).is_ok(), "inner whitespace collapses to a space");
        assert!(normalize_labels(&strings(&["a\u{0}b"])).is_err());
        assert!(normalize_labels(&strings(&[&"x".repeat(MAX_LABEL_CHARS)])).is_ok());
        assert!(normalize_labels(&strings(&[&"x".repeat(MAX_LABEL_CHARS + 1)])).unwrap_err().contains("24"));
    }

    #[test]
    fn at_most_eight_distinct_labels() {
        let eight: Vec<String> = (0..MAX_LABELS).map(|n| format!("l{n}")).collect();
        assert_eq!(normalize_labels(&eight).unwrap().len(), MAX_LABELS);
        let mut nine = eight.clone();
        nine.push("one more".to_string());
        assert!(normalize_labels(&nine).is_err());
        // Duplicates do not count toward the limit.
        let mut repeated = eight;
        repeated.push("L0".to_string());
        assert_eq!(normalize_labels(&repeated).unwrap().len(), MAX_LABELS);
    }

    #[test]
    fn validation_accepts_service_mb_acronyms_and_serializes_frontend_names() {
        // Node's existing wire fields use MB; serde's camelCase fields sent to the UI use Mb.
        let value = serde_json::json!({
            "canProceed": true, "hasWarnings": true, "totalStagedSize": 62914560,
            "totalStagedSizeMB": 60.0, "suggestedGitignore": ["large.bin"],
            "issues": [{"filePath": "large.bin", "severity": "warning", "reason": "Large file",
                "sizeBytes": 62914560, "sizeMB": 60.0}]
        });
        let decoded: PreSyncValidation = serde_json::from_value(value).unwrap();
        assert_eq!(decoded.total_staged_size_mb, 60.0);
        assert_eq!(decoded.issues[0].size_mb, Some(60.0));
        let frontend = serde_json::to_value(decoded).unwrap();
        assert_eq!(frontend["totalStagedSizeMb"], 60.0);
        assert_eq!(frontend["issues"][0]["sizeMb"], 60.0);
        assert!(serde_json::from_value::<PreSyncValidation>(frontend).is_ok());
    }

    // A cache entry as written before the branch/upstream/remote-check fields existed.
    const OLD_CACHE_ENTRY: &str = r#"[{
        "id": "app-1", "name": "app",
        "githubOwner": "o", "githubRepo": "o/app", "githubUrl": "https://github.com/o/app.git",
        "localPath": "C:/src/app",
        "projectStatus": "needs_push",
        "gitStatus": {
            "isGitRepo": true, "hasRemote": true,
            "uncommittedFiles": 2, "untrackedFiles": 1, "modifiedFiles": ["a.rs"],
            "unpushedCommits": 3, "remoteBranches": ["feature"],
            "syncStatus": "localchanges", "lastChecked": "2026-01-01T00:00:00Z"
        },
        "createdAt": "2026-01-01T00:00:00Z", "lastSynced": null
    }]"#;

    #[test]
    fn old_cache_decodes_with_defaulted_status_fields() {
        let projects: Vec<Project> = serde_json::from_str(OLD_CACHE_ENTRY).unwrap();
        let status = projects[0].git_status.as_ref().unwrap();
        assert_eq!(status.sync_status, SyncStatus::LocalChanges);
        assert_eq!(status.current_branch, None);
        assert_eq!(status.upstream, None);
        assert_eq!(status.remote_url, None);
        assert_eq!(status.behind_commits, 0);
        assert_eq!(status.remote_checked_at, None);
        assert_eq!(status.remote_error, None);
        assert_eq!(status.unpushed_commits, 3);
    }

    #[test]
    fn legacy_lowercase_sync_status_values_are_accepted() {
        for (old, expected) in [
            ("synced", SyncStatus::Synced),
            ("localchanges", SyncStatus::LocalChanges),
            ("remotebranches", SyncStatus::RemoteBranches),
            ("both", SyncStatus::Both),
            ("notconnected", SyncStatus::NotConnected),
        ] {
            let parsed: SyncStatus = serde_json::from_str(&format!("\"{old}\"")).unwrap();
            assert_eq!(parsed, expected, "legacy value {old}");
        }
    }

    #[test]
    fn sync_status_serializes_snake_case() {
        for (status, wire) in [
            (SyncStatus::LocalChanges, "local_changes"),
            (SyncStatus::RemoteBranches, "remote_branches"),
            (SyncStatus::NotConnected, "not_connected"),
            (SyncStatus::Behind, "behind"),
            (SyncStatus::Diverged, "diverged"),
            (SyncStatus::Unavailable, "unavailable"),
        ] {
            assert_eq!(serde_json::to_string(&status).unwrap(), format!("\"{wire}\""));
            let back: SyncStatus = serde_json::from_str(&format!("\"{wire}\"")).unwrap();
            assert_eq!(back, status);
        }
    }

    #[test]
    fn publish_options_default_to_no_selection_and_no_warning_override() {
        let push: SyncAction = serde_json::from_str(r#"{"type":"push_local"}"#).unwrap();
        match push {
            SyncAction::PushLocal { selected_files, allow_warnings, .. } => {
                assert_eq!(selected_files, None);
                assert!(!allow_warnings);
            }
            other => panic!("unexpected action: {other:?}"),
        }

        let full: SyncAction = serde_json::from_str(
            r#"{"type":"full_sync","selectedFiles":["src/a.rs"],"allowWarnings":true}"#,
        )
        .unwrap();
        match full {
            SyncAction::FullSync { selected_files, allow_warnings, .. } => {
                assert_eq!(selected_files, Some(vec!["src/a.rs".to_string()]));
                assert!(allow_warnings);
            }
            other => panic!("unexpected action: {other:?}"),
        }
    }
}
