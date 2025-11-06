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

    pub fn push_local(&self, repo_path: &str) -> Result<PushResult> {
        let payload = serde_json::json!({ "repoPath": repo_path });
        let result = self.execute("pushLocal", payload)?;
        let push_result: PushResult = serde_json::from_value(result)?;
        Ok(push_result)
    }

    pub fn merge_branches(&self, repo_path: &str, branches: &[String]) -> Result<Vec<String>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "branches": branches
        });
        let result = self.execute("mergeBranches", payload)?;
        let merged: MergeResult = serde_json::from_value(result)?;
        Ok(merged.merged)
    }

    pub fn pull_branches(&self, repo_path: &str, branches: &[String]) -> Result<Vec<String>> {
        let payload = serde_json::json!({
            "repoPath": repo_path,
            "branches": branches
        });
        let result = self.execute("pullBranches", payload)?;
        let pulled: PullResult = serde_json::from_value(result)?;
        Ok(pulled.pulled)
    }

    pub fn full_sync(&self, repo_path: &str) -> Result<FullSyncResult> {
        let payload = serde_json::json!({ "repoPath": repo_path });
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
