use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize, Deserialize)]
struct IPCCommand {
    id: String,
    #[serde(rename = "type")]
    command_type: String,
    payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct IPCResponse {
    id: String,
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

pub struct GitService {
    child: Arc<Mutex<Option<Child>>>,
    command_counter: Arc<Mutex<u64>>,
}

impl GitService {
    pub fn new() -> Result<Self> {
        let service = Self {
            child: Arc::new(Mutex::new(None)),
            command_counter: Arc::new(Mutex::new(0)),
        };

        service.start()?;
        Ok(service)
    }

    fn start(&self) -> Result<()> {
        let git_service_path = if cfg!(debug_assertions) {
            // Development mode: running from src-tauri directory
            std::path::PathBuf::from("../git-service/dist/index.js")
        } else {
            // Production mode: Tauri bundles resources in _up_ directory
            let exe_dir = std::env::current_exe()
                .context("Failed to get executable path")?
                .parent()
                .context("Failed to get executable directory")?
                .to_path_buf();
            exe_dir.join("_up_").join("git-service").join("dist").join("index.js")
        };

        eprintln!("[Rust] Starting Git service from: {}", git_service_path.display());

        let mut cmd = Command::new("node");
        cmd.arg(&git_service_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        // On Windows, hide the console window for the Node.js process
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn()
            .context("Failed to spawn Git service process. Ensure Node.js is installed.")?;

        // Test with a ping command and consume the response
        let stdin = child.stdin.as_mut().context("Failed to access stdin")?;
        let test_cmd = IPCCommand {
            id: "init".to_string(),
            command_type: "ping".to_string(),
            payload: serde_json::json!({}),
        };
        let json = serde_json::to_string(&test_cmd)?;
        writeln!(stdin, "{}", json)?;
        stdin.flush()?;

        // Read and consume the ping response so it doesn't interfere with future commands
        let stdout = child.stdout.as_mut().context("Failed to access stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line)?;

        *self.child.lock()
            .expect("Git service child mutex poisoned") = Some(child);
        eprintln!("[Rust] Git service started successfully");
        Ok(())
    }

    fn get_next_id(&self) -> String {
        let mut counter = self.command_counter.lock()
            .expect("Command counter mutex poisoned");
        *counter += 1;
        format!("cmd_{}", *counter)
    }

    pub fn execute(&self, command_type: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
        let mut child_guard = self.child.lock()
            .expect("Git service child mutex poisoned");
        let child = child_guard.as_mut().context("Git service not running")?;

        let command = IPCCommand {
            id: self.get_next_id(),
            command_type: command_type.to_string(),
            payload,
        };

        // Send command
        let stdin = child.stdin.as_mut().context("Failed to access stdin")?;
        let json = serde_json::to_string(&command)?;
        writeln!(stdin, "{}", json)?;
        stdin.flush()?;

        // Read response
        let stdout = child.stdout.as_mut().context("Failed to access stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line)?;

        // Debug logging removed for production - response may contain sensitive data

        let response: IPCResponse = serde_json::from_str(&line)
            .context(format!("Failed to parse Git service response: '{}'", line.trim()))?;

        if response.success {
            Ok(response.data.unwrap_or(serde_json::json!(null)))
        } else {
            Err(anyhow::anyhow!(
                "Git service error: {}",
                response.error.unwrap_or_else(|| "Unknown error".to_string())
            ))
        }
    }

    pub fn check_status(&self, repo_path: &str) -> Result<StatusInfo> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("checkStatus", payload)?;
        let status: StatusInfo = serde_json::from_value(result)?;
        Ok(status)
    }

    pub fn validate_before_sync(&self, repo_path: &str, selected_files: Option<Vec<String>>) -> Result<crate::models::PreSyncValidation> {
        let payload = publish_payload(repo_path, None, None, None, &PublishOptions { selected_files, allow_warnings: false });
        let result = self.execute("validateBeforeSync", payload)?;
        let validation: crate::models::PreSyncValidation = serde_json::from_value(result)?;
        Ok(validation)
    }

    pub fn push_local(
        &self,
        repo_path: &str,
        remote_url: Option<&str>,
        commit_message: Option<&str>,
        commit_description: Option<&str>,
        options: &PublishOptions,
    ) -> Result<PushResult> {
        let payload = publish_payload(repo_path, remote_url, commit_message, commit_description, options);
        let result = self.execute("pushLocal", payload)?;
        let push_result: PushResult = serde_json::from_value(result)?;
        Ok(push_result)
    }

    pub fn merge_branches(&self, repo_path: &str, branches: &[String], remote_url: Option<&str>) -> Result<MergeResult> {
        let mut payload = serde_json::json!({
            "repoPath": repo_path,
            "branches": branches
        });
        if let Some(url) = remote_url {
            payload["remoteUrl"] = serde_json::json!(url);
        }
        let result = self.execute("mergeBranches", payload)?;
        let merged: MergeResult = serde_json::from_value(result)?;
        Ok(merged)
    }

    pub fn pull_branches(&self, repo_path: &str, branches: &[String], remote_url: Option<&str>) -> Result<Vec<String>> {
        let mut payload = serde_json::json!({
            "repoPath": repo_path,
            "branches": branches
        });
        if let Some(url) = remote_url {
            payload["remoteUrl"] = serde_json::json!(url);
        }
        let result = self.execute("pullBranches", payload)?;
        let pulled: PullResult = serde_json::from_value(result)?;
        Ok(pulled.pulled)
    }

    pub fn full_sync(
        &self,
        repo_path: &str,
        remote_url: Option<&str>,
        commit_message: Option<&str>,
        commit_description: Option<&str>,
        options: &PublishOptions,
    ) -> Result<FullSyncResult> {
        let payload = publish_payload(repo_path, remote_url, commit_message, commit_description, options);
        let result = self.execute("fullSync", payload)?;
        let sync_result: FullSyncResult = serde_json::from_value(result)?;
        Ok(sync_result)
    }

    /// Forwards an already-validated recovery request. The service owns the vault
    /// location, so only the source path and the request travel over IPC.
    pub fn recovery(&self, repo_path: &str, request: serde_json::Value) -> Result<serde_json::Value> {
        let vault_root = crate::app_data::config_dir()?.join("checkpoints");
        let payload = serde_json::json!({ "repoPath": repo_path, "request": request, "vaultRoot": vault_root });
        self.execute("recovery", payload)
    }

    /// Holds the token in the service process memory only; callers must not log it.
    pub fn set_github_token(&self, token: &str) -> Result<()> {
        let payload = serde_json::json!({ "token": token });
        self.execute("setGithubToken", payload)?;
        Ok(())
    }

    pub fn verify_github_token(&self, token: &str) -> Result<TokenVerification> {
        let payload = serde_json::json!({ "token": token });
        let result = self.execute("verifyGithubToken", payload)?;
        let verification: TokenVerification = serde_json::from_value(result)?;
        Ok(verification)
    }

    pub fn list_github_repos(&self, token: &str) -> Result<Vec<GitHubRepository>> {
        let payload = serde_json::json!({ "token": token });
        let result = self.execute("listGithubRepos", payload)?;
        let repos: Vec<GitHubRepository> = serde_json::from_value(result)?;
        Ok(repos)
    }

    pub fn clone_repository(&self, github_url: &str, local_path: &str) -> Result<()> {
        let payload = serde_json::json!({
            "githubUrl": github_url,
            "localPath": local_path
        });
        self.execute("cloneRepository", payload)?;
        Ok(())
    }

    pub fn create_github_repository(&self, token: &str, repo_name: &str, is_private: bool) -> Result<String> {
        let payload = serde_json::json!({
            "token": token,
            "repoName": repo_name,
            "isPrivate": is_private
        });
        let result = self.execute("createGithubRepository", payload)?;
        let clone_url: String = serde_json::from_value(result["cloneUrl"].clone())?;
        Ok(clone_url)
    }

    pub fn init_repository(&self, local_path: &str) -> Result<()> {
        let payload = serde_json::json!({ "localPath": local_path });
        self.execute("initRepository", payload)?;
        Ok(())
    }

    pub fn add_remote(&self, local_path: &str, remote_name: &str, remote_url: &str) -> Result<()> {
        let payload = serde_json::json!({
            "localPath": local_path,
            "remoteName": remote_name,
            "remoteUrl": remote_url
        });
        self.execute("addRemote", payload)?;
        Ok(())
    }

    // Advanced Git Features
    pub fn get_branches(&self, repo_path: &str) -> Result<Vec<BranchInfo>> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("getBranches", payload)?;
        let branches: Vec<BranchInfo> = serde_json::from_value(result)?;
        Ok(branches)
    }

    pub fn create_branch(&self, repo_path: &str, branch_name: &str, checkout: bool) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "branchName": branch_name,
            "checkout": checkout
        });
        self.execute("createBranch", payload)?;
        Ok(())
    }

    pub fn switch_branch(&self, repo_path: &str, branch_name: &str) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "branchName": branch_name
        });
        self.execute("switchBranch", payload)?;
        Ok(())
    }

    pub fn delete_branch(&self, repo_path: &str, branch_name: &str, force: bool) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "branchName": branch_name,
            "force": force
        });
        self.execute("deleteBranch", payload)?;
        Ok(())
    }

    pub fn get_commit_history(&self, repo_path: &str, limit: u32) -> Result<Vec<CommitInfo>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "limit": limit
        });
        let result = self.execute("getCommitHistory", payload)?;
        let commits: Vec<CommitInfo> = serde_json::from_value(result)?;
        Ok(commits)
    }

    pub fn get_file_changes(&self, repo_path: &str) -> Result<Vec<FileChangeInfo>> {
        let result = self.execute("getFileChanges", serde_json::json!({ "repoPath": repo_path }))?;
        Ok(serde_json::from_value(result)?)
    }

    pub fn get_diff(&self, repo_path: &str, file_path: Option<String>, scope: Option<String>) -> Result<Vec<DiffInfo>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "filePath": file_path,
            "scope": scope.unwrap_or_else(|| "all".to_string())
        });
        let result = self.execute("getDiff", payload)?;
        let diffs: Vec<DiffInfo> = serde_json::from_value(result)?;
        Ok(diffs)
    }

    pub fn create_stash(&self, repo_path: &str, message: Option<String>) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "message": message
        });
        self.execute("createStash", payload)?;
        Ok(())
    }

    pub fn list_stashes(&self, repo_path: &str) -> Result<Vec<StashInfo>> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("listStashes", payload)?;
        let stashes: Vec<StashInfo> = serde_json::from_value(result)?;
        Ok(stashes)
    }

    pub fn apply_stash(&self, repo_path: &str, index: u32) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "index": index
        });
        self.execute("applyStash", payload)?;
        Ok(())
    }

    pub fn pop_stash(&self, repo_path: &str) -> Result<()> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        self.execute("popStash", payload)?;
        Ok(())
    }

    pub fn drop_stash(&self, repo_path: &str, index: u32) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "index": index
        });
        self.execute("dropStash", payload)?;
        Ok(())
    }

    pub fn create_tag(&self, repo_path: &str, tag_name: &str, message: Option<String>) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "tagName": tag_name,
            "message": message
        });
        self.execute("createTag", payload)?;
        Ok(())
    }

    pub fn list_tags(&self, repo_path: &str) -> Result<Vec<TagInfo>> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("listTags", payload)?;
        let tags: Vec<TagInfo> = serde_json::from_value(result)?;
        Ok(tags)
    }

    pub fn push_tag(&self, repo_path: &str, tag_name: &str) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "tagName": tag_name
        });
        self.execute("pushTag", payload)?;
        Ok(())
    }

    pub fn push_all_tags(&self, repo_path: &str) -> Result<()> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        self.execute("pushAllTags", payload)?;
        Ok(())
    }

    pub fn delete_tag(&self, repo_path: &str, tag_name: &str) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "tagName": tag_name
        });
        self.execute("deleteTag", payload)?;
        Ok(())
    }

    pub fn cherry_pick(&self, repo_path: &str, commit_hash: &str) -> Result<()> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "commitHash": commit_hash
        });
        self.execute("cherryPick", payload)?;
        Ok(())
    }

    pub fn get_current_branch(&self, repo_path: &str) -> Result<String> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("getCurrentBranch", payload)?;
        let branch: String = serde_json::from_value(result)?;
        Ok(branch)
    }

    // ==================== ANALYTICS FEATURES ====================

    pub fn get_analytics_commit_history(
        &self,
        repo_path: &str,
        limit: u32,
        since: Option<String>,
        until: Option<String>,
        author: Option<String>,
    ) -> Result<Vec<AnalyticsCommit>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "params": {
                "limit": limit,
                "since": since,
                "until": until,
                "author": author
            }
        });
        let result = self.execute("getAnalyticsCommitHistory", payload)?;
        let commits: Vec<AnalyticsCommit> = serde_json::from_value(result)?;
        Ok(commits)
    }

    pub fn get_branch_staleness(&self, repo_path: &str) -> Result<Vec<BranchStaleness>> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("getBranchStaleness", payload)?;
        let staleness: Vec<BranchStaleness> = serde_json::from_value(result)?;
        Ok(staleness)
    }

    #[allow(dead_code)]
    pub fn get_commit_counts_by_date(
        &self,
        repo_path: &str,
        since: String,
        until: Option<String>,
        author: Option<String>,
    ) -> Result<std::collections::HashMap<String, u32>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "since": since,
            "until": until,
            "author": author
        });
        let result = self.execute("getCommitCountsByDate", payload)?;
        let counts: std::collections::HashMap<String, u32> = serde_json::from_value(result)?;
        Ok(counts)
    }

    pub fn get_days_since_last_commit(&self, repo_path: &str) -> Result<Option<i32>> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("getDaysSinceLastCommit", payload)?;
        let days: Option<i32> = serde_json::from_value(result)?;
        Ok(days)
    }

    pub fn get_aggregate_stats(&self, repo_path: &str) -> Result<AggregateStats> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("getAggregateStats", payload)?;
        let stats: AggregateStats = serde_json::from_value(result)?;
        Ok(stats)
    }

    #[allow(dead_code)]
    pub fn get_commit_count_for_date_range(
        &self,
        repo_path: &str,
        since: String,
        until: Option<String>,
    ) -> Result<u32> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "since": since,
            "until": until
        });
        let result = self.execute("getCommitCountForDateRange", payload)?;
        let count: u32 = serde_json::from_value(result)?;
        Ok(count)
    }
}

impl Drop for GitService {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                eprintln!("[Rust] Shutting down Git service");
                // Close stdin to signal EOF for graceful shutdown
                drop(child.stdin.take());
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// What a publish may commit. `selected_files: None` pushes existing commits only.
#[derive(Debug, Clone, Default)]
pub struct PublishOptions {
    pub selected_files: Option<Vec<String>>,
    pub allow_warnings: bool,
}

fn publish_payload(
    repo_path: &str,
    remote_url: Option<&str>,
    commit_message: Option<&str>,
    commit_description: Option<&str>,
    options: &PublishOptions,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "repoPath": repo_path,
        "allowWarnings": options.allow_warnings,
    });
    if let Some(url) = remote_url {
        payload["remoteUrl"] = serde_json::json!(url);
    }
    if let Some(msg) = commit_message {
        payload["commitMessage"] = serde_json::json!(msg);
    }
    if let Some(desc) = commit_description {
        payload["commitDescription"] = serde_json::json!(desc);
    }
    if let Some(files) = &options.selected_files {
        payload["selectedFiles"] = serde_json::json!(files);
    }
    payload
}

// Response types matching Git service output. Fields the service added later are
// optional so an older service build still decodes.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
    #[serde(default)]
    pub is_git_repo: Option<bool>,
    #[serde(default)]
    pub has_remote: Option<bool>,
    #[serde(default)]
    pub current_branch: Option<String>,
    #[serde(default)]
    pub upstream: Option<String>,
    #[serde(default)]
    pub behind_commits: u32,
    #[serde(default)]
    pub remote_checked_at: Option<String>,
    #[serde(default)]
    pub remote_error: Option<String>,
    pub uncommitted_files: u32,
    pub untracked_files: u32,
    pub modified_files: Vec<String>,
    pub unpushed_commits: u32,
    pub remote_branches: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PushResult {
    pub committed: u32,
    pub pushed: bool,
}

impl PushResult {
    /// The service reports whether a push happened, not how many; a push is one update.
    pub fn pushed_count(&self) -> u32 {
        if self.pushed { 1 } else { 0 }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResult {
    pub merged: Vec<String>,
    #[serde(default)]
    pub deleted: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullResult {
    pub pulled: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FullSyncResult {
    pub success: bool,
    pub message: String,
    #[serde(default)]
    pub committed: Option<u32>,
    #[serde(default)]
    pub pushed: Option<u32>,
    #[serde(default)]
    pub pulled: Option<u32>,
    #[serde(default)]
    pub merged: Option<Vec<String>>,
    #[serde(default)]
    pub deleted: Option<Vec<String>>,
    #[serde(default)]
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenVerification {
    pub username: String,
    pub valid: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    pub name: String,
    pub full_name: String,
    pub clone_url: String,
    pub html_url: String,
    pub owner: String,
    pub is_private: bool,
    pub default_branch: String,
}

// Advanced Git Features Types
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,
    pub commit: String,
    pub label: String,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub body: String,
    pub refs: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffChange {
    pub line: i32,
    #[serde(rename = "type")]
    pub change_type: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffInfo {
    pub file_name: String,
    pub changes: Vec<DiffChange>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub binary: bool,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileChangeInfo {
    pub path: String,
    pub staged: Option<String>,
    pub unstaged: Option<String>,
    pub untracked: bool,
    pub conflicted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StashInfo {
    pub index: u32,
    pub hash: String,
    pub message: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
}

// Analytics Types
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub branch: String,
    pub files_changed: u32,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchStaleness {
    pub name: String,
    pub days_since_last_commit: i32,
    pub is_remote: bool,
    pub last_commit_hash: String,
    pub last_commit_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateStats {
    pub total_commits: u32,
    pub total_branches: u32,
    pub total_tags: u32,
    pub total_stashes: u32,
    pub contributors: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publish_payload_omits_selection_when_none() {
        let payload = publish_payload("C:/src/app", None, None, None, &PublishOptions::default());
        assert_eq!(payload["repoPath"], "C:/src/app");
        assert_eq!(payload["allowWarnings"], false);
        assert!(payload.get("selectedFiles").is_none(), "no selection must not become an empty/all selection");
        assert!(payload.get("remoteUrl").is_none());
    }

    #[test]
    fn publish_payload_carries_options_and_commit_text() {
        let options = PublishOptions {
            selected_files: Some(vec!["src/a.rs".to_string(), "b.txt".to_string()]),
            allow_warnings: true,
        };
        let payload = publish_payload(
            "C:/src/app",
            Some("https://github.com/o/app.git"),
            Some("msg"),
            Some("desc"),
            &options,
        );
        assert_eq!(payload["selectedFiles"], serde_json::json!(["src/a.rs", "b.txt"]));
        assert_eq!(payload["allowWarnings"], true);
        assert_eq!(payload["remoteUrl"], "https://github.com/o/app.git");
        assert_eq!(payload["commitMessage"], "msg");
        assert_eq!(payload["commitDescription"], "desc");
    }

    #[test]
    fn publish_payload_keeps_an_explicit_empty_selection() {
        let options = PublishOptions { selected_files: Some(Vec::new()), allow_warnings: false };
        let payload = publish_payload("p", None, None, None, &options);
        assert_eq!(payload["selectedFiles"], serde_json::json!([]));
    }

    #[test]
    fn status_info_decodes_new_service_output() {
        let info: StatusInfo = serde_json::from_value(serde_json::json!({
            "isGitRepo": true, "hasRemote": true, "currentBranch": "main",
            "upstream": "origin/main", "behindCommits": 2,
            "remoteCheckedAt": "2026-09-21T00:00:00Z", "remoteError": null,
            "uncommittedFiles": 1, "untrackedFiles": 0, "modifiedFiles": ["a"],
            "unpushedCommits": 3, "remoteBranches": ["feature"]
        }))
        .unwrap();
        assert_eq!(info.is_git_repo, Some(true));
        assert_eq!(info.current_branch.as_deref(), Some("main"));
        assert_eq!(info.upstream.as_deref(), Some("origin/main"));
        assert_eq!(info.behind_commits, 2);
        assert_eq!(info.remote_error, None);
    }

    #[test]
    fn status_info_decodes_older_service_output() {
        let info: StatusInfo = serde_json::from_value(serde_json::json!({
            "uncommittedFiles": 0, "untrackedFiles": 0, "modifiedFiles": [],
            "unpushedCommits": 0, "remoteBranches": []
        }))
        .unwrap();
        assert_eq!(info.is_git_repo, None);
        assert_eq!(info.has_remote, None);
        assert_eq!(info.remote_checked_at, None);
        assert_eq!(info.behind_commits, 0);
    }

    #[test]
    fn push_count_follows_the_reported_bool() {
        assert_eq!(PushResult { committed: 2, pushed: true }.pushed_count(), 1);
        assert_eq!(PushResult { committed: 2, pushed: false }.pushed_count(), 0);
    }

    #[test]
    fn full_sync_result_does_not_invent_pushed_or_deleted() {
        let result: FullSyncResult = serde_json::from_value(serde_json::json!({
            "success": true, "message": "ok", "committed": 1, "merged": []
        }))
        .unwrap();
        assert_eq!(result.pushed, None);
        assert_eq!(result.deleted, None);

        let result: FullSyncResult = serde_json::from_value(serde_json::json!({
            "success": true, "message": "ok", "committed": 1, "pushed": 0
        }))
        .unwrap();
        assert_eq!(result.pushed, Some(0));
    }
}
