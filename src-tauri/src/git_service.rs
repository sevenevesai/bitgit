use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

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
        // The working directory is src-tauri, so we need to go up one level
        let git_service_path = if cfg!(debug_assertions) {
            // Development mode: running from src-tauri directory
            "../git-service/dist/index.js"
        } else {
            // Production mode: resources are bundled differently
            "../git-service/dist/index.js"
        };

        let mut child = Command::new("node")
            .arg(git_service_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("Failed to spawn Git service process")?;

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
        eprintln!("[Rust] Git service ping response: {}", line.trim());

        *self.child.lock().unwrap() = Some(child);
        eprintln!("[Rust] Git service started successfully");
        Ok(())
    }

    fn get_next_id(&self) -> String {
        let mut counter = self.command_counter.lock().unwrap();
        *counter += 1;
        format!("cmd_{}", *counter)
    }

    pub fn execute(&self, command_type: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
        let mut child_guard = self.child.lock().unwrap();
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

        eprintln!("[Rust] Git service raw response: '{}'", line.trim());
        eprintln!("[Rust] Git service response length: {}", line.len());

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

    pub fn push_local(&self, repo_path: &str, remote_url: Option<&str>) -> Result<PushResult> {
        let mut payload = serde_json::json!({ "repoPath": repo_path });
        if let Some(url) = remote_url {
            payload["remoteUrl"] = serde_json::json!(url);
        }
        let result = self.execute("pushLocal", payload)?;
        let push_result: PushResult = serde_json::from_value(result)?;
        Ok(push_result)
    }

    pub fn merge_branches(&self, repo_path: &str, branches: &[String], remote_url: Option<&str>) -> Result<Vec<String>> {
        let mut payload = serde_json::json!({
            "repoPath": repo_path,
            "branches": branches
        });
        if let Some(url) = remote_url {
            payload["remoteUrl"] = serde_json::json!(url);
        }
        let result = self.execute("mergeBranches", payload)?;
        let merged: MergeResult = serde_json::from_value(result)?;
        Ok(merged.merged)
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

    pub fn full_sync(&self, repo_path: &str, remote_url: Option<&str>) -> Result<FullSyncResult> {
        let mut payload = serde_json::json!({ "repoPath": repo_path });
        if let Some(url) = remote_url {
            payload["remoteUrl"] = serde_json::json!(url);
        }
        let result = self.execute("fullSync", payload)?;
        let sync_result: FullSyncResult = serde_json::from_value(result)?;
        Ok(sync_result)
    }

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

    pub fn push_to_remote(&self, local_path: &str, remote_name: &str, branch: &str) -> Result<()> {
        let payload = serde_json::json!({
            "localPath": local_path,
            "remoteName": remote_name,
            "branch": branch
        });
        self.execute("pushToRemote", payload)?;
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

    pub fn get_diff(&self, repo_path: &str, file_path: Option<String>) -> Result<Vec<DiffInfo>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "filePath": file_path
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
        if let Some(mut child) = self.child.lock().unwrap().take() {
            eprintln!("[Rust] Shutting down Git service");
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

// Response types matching Git service output
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResult {
    pub merged: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullResult {
    pub pulled: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FullSyncResult {
    pub success: bool,
    pub message: String,
    pub committed: Option<u32>,
    pub merged: Option<Vec<String>>,
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
