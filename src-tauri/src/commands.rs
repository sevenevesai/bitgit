use crate::credentials::CredentialManager;
use crate::git_service::{GitService, StatusInfo as GitStatusInfo, StashInfo, TagInfo, BranchInfo, CommitInfo, DiffInfo, DiffChange, AnalyticsCommit, BranchStaleness, AggregateStats};
use crate::models::*;
use crate::project_cache;
use crate::scanner::RepositoryScanner;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Global Git service instance (Arc allows multiple references without dropping)
static GIT_SERVICE: Lazy<Mutex<Option<Arc<GitService>>>> = Lazy::new(|| Mutex::new(None));

// Repository cache
static REPOSITORIES: Lazy<Mutex<HashMap<String, Repository>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn get_git_service() -> Result<Arc<GitService>, String> {
    let mut service_guard = GIT_SERVICE.lock().unwrap();

    if service_guard.is_none() {
        eprintln!("[Rust] Initializing Git service...");
        let service = GitService::new()
            .map_err(|e| format!("Failed to start Git service: {}", e))?;
        *service_guard = Some(Arc::new(service));
    }

    // Clone the Arc to return a reference to the same service
    service_guard
        .as_ref()
        .ok_or_else(|| "Git service not available".to_string())
        .map(|arc| Arc::clone(arc))
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to BitGit!", name)
}

#[tauri::command]
pub async fn get_repositories() -> Result<Vec<Repository>, String> {
    let repos = REPOSITORIES.lock().unwrap();
    Ok(repos.values().cloned().collect())
}

#[tauri::command]
pub async fn check_repository_status(repo_id: String) -> Result<RepositoryStatus, String> {
    let repos = REPOSITORIES.lock().unwrap();
    let repo = repos.get(&repo_id)
        .ok_or_else(|| format!("Repository not found: {}", repo_id))?
        .clone();
    drop(repos);

    // Check if local path exists
    let local_path = repo.local_path
        .as_ref()
        .ok_or_else(|| "Repository has no local path".to_string())?;

    let service = get_git_service()?;
    let status_info = service.check_status(local_path)
        .map_err(|e| format!("Failed to check status: {}", e))?;

    let sync_status = determine_sync_status(&status_info);

    Ok(RepositoryStatus {
        is_git_repo: true,
        has_remote: true,
        uncommitted_files: status_info.uncommitted_files,
        untracked_files: status_info.untracked_files,
        modified_files: status_info.modified_files,
        unpushed_commits: status_info.unpushed_commits,
        remote_branches: status_info.remote_branches,
        sync_status,
        last_checked: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn sync_repository(id: String, action: SyncAction) -> Result<SyncResult, String> {
    let repos = REPOSITORIES.lock().unwrap();
    let repo = repos.get(&id)
        .ok_or_else(|| format!("Repository not found: {}", id))?
        .clone();
    drop(repos);

    // Check if local path exists
    let local_path = repo.local_path
        .as_ref()
        .ok_or_else(|| "Repository has no local path".to_string())?;

    let service = get_git_service()?;

    // Get GitHub URL as Option<&str> for passing to git service
    let remote_url = repo.github_url.as_deref();

    match action {
        SyncAction::PushLocal => {
            let result = service.push_local(local_path, remote_url)
                .map_err(|e| format!("Push failed: {}", e))?;

            let new_status = service.check_status(local_path)
                .map_err(|e| format!("Failed to check status: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: "Successfully pushed local changes".to_string(),
                details: SyncDetails {
                    committed: Some(result.committed),
                    pushed: Some(1),
                    merged: None,
                    deleted: None,
                    errors: None,
                },
            })
        }
        SyncAction::MergeBranches { branches } => {
            let merged = service.merge_branches(local_path, &branches, remote_url)
                .map_err(|e| format!("Merge failed: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: format!("Successfully merged {} branches", merged.len()),
                details: SyncDetails {
                    committed: None,
                    pushed: None,
                    merged: Some(merged.clone()),
                    deleted: Some(merged),
                    errors: None,
                },
            })
        }
        SyncAction::PullBranches { branches } => {
            let pulled = service.pull_branches(local_path, &branches, remote_url)
                .map_err(|e| format!("Pull failed: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: format!("Successfully pulled {} branches", pulled.len()),
                details: SyncDetails {
                    committed: None,
                    pushed: Some(1), // Main branch is pushed
                    merged: Some(pulled.clone()),
                    deleted: None, // Branches are NOT deleted
                    errors: None,
                },
            })
        }
        SyncAction::FullSync => {
            let result = service.full_sync(local_path, remote_url)
                .map_err(|e| format!("Full sync failed: {}", e))?;

            Ok(SyncResult {
                success: result.success,
                message: result.message,
                details: SyncDetails {
                    committed: result.committed,
                    pushed: result.committed.map(|_| 1),
                    merged: result.merged.clone(),
                    deleted: result.merged,
                    errors: result.errors,
                },
            })
        }
    }
}

#[tauri::command]
pub async fn save_github_token(username: String, token: String) -> Result<(), String> {
    let manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;

    manager
        .save_token(&username, &token)
        .map_err(|e| format!("Failed to save token: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct GitHubCredentials {
    pub username: String,
    pub token: String,
}

#[tauri::command]
pub async fn get_stored_github_credentials() -> Result<Option<GitHubCredentials>, String> {
    let manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;

    match manager.get_stored_credential() {
        Ok(Some((username, token))) => Ok(Some(GitHubCredentials { username, token })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve credentials: {}", e)),
    }
}

#[tauri::command]
pub async fn get_github_token(username: String) -> Result<String, String> {
    let manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;

    manager
        .get_token(&username)
        .map_err(|e| format!("Failed to retrieve token: {}", e))
}

#[tauri::command]
pub async fn has_github_token(username: String) -> Result<bool, String> {
    let manager = CredentialManager::new()
        .map_err(|e| format!("Failed to access credential manager: {}", e))?;

    Ok(manager.has_token(&username))
}

#[tauri::command]
pub async fn verify_github_token(token: String) -> Result<bool, String> {
    let service = get_git_service()?;
    let result = service.verify_github_token(&token)
        .map_err(|e| format!("Failed to verify token: {}", e))?;
    Ok(result.valid)
}

#[tauri::command]
pub async fn scan_directories(
    directories: Vec<String>,
    max_depth: usize,
    exclude_patterns: Vec<String>,
) -> Result<Vec<String>, String> {
    let paths: Vec<PathBuf> = directories.iter().map(PathBuf::from).collect();
    let scanner = RepositoryScanner::new(paths, max_depth, exclude_patterns);

    let repos = scanner.scan();
    let repo_paths: Vec<String> = repos
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    Ok(repo_paths)
}

// Helper functions

fn determine_sync_status(status: &GitStatusInfo) -> SyncStatus {
    let has_local_changes = status.uncommitted_files > 0 || status.unpushed_commits > 0;
    let has_remote_branches = !status.remote_branches.is_empty();

    if has_local_changes && has_remote_branches {
        SyncStatus::Both
    } else if has_local_changes {
        SyncStatus::LocalChanges
    } else if has_remote_branches {
        SyncStatus::RemoteBranches
    } else {
        SyncStatus::Synced
    }
}

// Function to add a repository to the cache
pub fn add_repository_to_cache(repo: Repository) {
    let mut repos = REPOSITORIES.lock().unwrap();
    repos.insert(repo.id.clone(), repo);
}

#[tauri::command]
pub async fn add_repositories(repo_paths: Vec<String>) -> Result<Vec<Repository>, String> {
    let service = get_git_service()?;
    let mut added_repos = Vec::new();

    for path in repo_paths {
        // Extract repository name from path
        let path_buf = PathBuf::from(&path);
        let name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        // Generate unique ID
        let id = format!("{}-{}", name, chrono::Utc::now().timestamp());

        // Check repository status
        let (git_status, project_status) = match service.check_status(&path) {
            Ok(status_info) => {
                let sync_status = determine_sync_status(&status_info);
                let git_status = GitStatus {
                    is_git_repo: true,
                    has_remote: true,
                    uncommitted_files: status_info.uncommitted_files,
                    untracked_files: status_info.untracked_files,
                    modified_files: status_info.modified_files,
                    unpushed_commits: status_info.unpushed_commits,
                    remote_branches: status_info.remote_branches,
                    sync_status: sync_status.clone(),
                    last_checked: chrono::Utc::now().to_rfc3339(),
                };
                let project_status = match sync_status {
                    SyncStatus::Synced => ProjectStatus::Synced,
                    _ => ProjectStatus::LocalOnly,
                };
                (Some(git_status), project_status)
            }
            Err(_) => {
                // If status check fails, assume local only
                (None, ProjectStatus::LocalOnly)
            }
        };

        let repo = Repository {
            id: id.clone(),
            name,
            github_owner: None,
            github_repo: None,
            github_url: None,
            local_path: Some(path),
            project_status,
            git_status,
            created_at: chrono::Utc::now().to_rfc3339(),
            last_synced: None,
            // Priority 3 fields
            description: None,
            archived: None,
            favorite: None,
            last_activity: None,
            statistics: None,
            template: None,
        };

        add_repository_to_cache(repo.clone());
        added_repos.push(repo);
    }

    Ok(added_repos)
}

#[tauri::command]
pub async fn fetch_github_repos(token: String) -> Result<Vec<Repository>, String> {
    let service = get_git_service()?;
    let github_repos = service.list_github_repos(&token)
        .map_err(|e| format!("Failed to fetch GitHub repos: {}", e))?;

    let mut added_repos = Vec::new();

    for gh_repo in github_repos {
        // Generate unique ID
        let id = format!("{}-{}", gh_repo.name, chrono::Utc::now().timestamp());

        // Create project with GitHub info only (no local path)
        let repo = Repository {
            id: id.clone(),
            name: gh_repo.name,
            github_owner: Some(gh_repo.owner),
            github_repo: Some(gh_repo.full_name.clone()),
            github_url: Some(gh_repo.clone_url),
            local_path: None, // No local path yet
            project_status: ProjectStatus::GithubOnly,
            git_status: None, // No git status without local path
            created_at: chrono::Utc::now().to_rfc3339(),
            last_synced: None,
            // Priority 3 fields
            description: None,
            archived: None,
            favorite: None,
            last_activity: None,
            statistics: None,
            template: None,
        };

        add_repository_to_cache(repo.clone());
        added_repos.push(repo);
    }

    Ok(added_repos)
}

// ============================================================================
// NEW PROJECT MANAGEMENT COMMANDS
// ============================================================================

/// Load all projects from cache
#[tauri::command]
pub async fn load_projects() -> Result<Vec<Project>, String> {
    project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))
}

/// Create a new project
#[tauri::command]
pub async fn create_project(
    name: String,
    github_owner: Option<String>,
    github_repo: Option<String>,
    github_url: Option<String>,
    local_path: Option<String>,
) -> Result<Project, String> {
    // Generate unique ID
    let id = format!("{}-{}", name.replace(" ", "-").to_lowercase(), chrono::Utc::now().timestamp());

    // Determine project status based on what's configured
    let project_status = match (&github_owner, &local_path) {
        (None, None) => ProjectStatus::NotConfigured,
        (Some(_), None) => ProjectStatus::GithubOnly,
        (None, Some(_)) => ProjectStatus::LocalOnly,
        (Some(_), Some(_)) => ProjectStatus::Ready,
    };

    // Create the project
    let project = Project {
        id: id.clone(),
        name,
        github_owner,
        github_repo,
        github_url,
        local_path,
        project_status,
        git_status: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_synced: None,
        // Priority 3 fields
        description: None,
        archived: None,
        favorite: None,
        last_activity: None,
        statistics: None,
        template: None,
    };

    // Save to cache
    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Update an existing project
#[tauri::command]
pub async fn update_project(project: Project) -> Result<Project, String> {
    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to update project: {}", e))?;

    Ok(project)
}

/// Delete a project
#[tauri::command]
pub async fn delete_project(project_id: String) -> Result<(), String> {
    project_cache::delete_project(&project_id)
        .map_err(|e| format!("Failed to delete project: {}", e))
}

/// Check status for a fully configured project (both GitHub and Local)
#[tauri::command]
pub async fn check_project_status(project_id: String) -> Result<Project, String> {
    eprintln!("[Rust] check_project_status called for project: {}", project_id);

    // Load the project
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    eprintln!("[Rust] Project found: {} (local: {:?}, github: {:?})",
        project.name, project.local_path, project.github_url);

    // Only check status if both GitHub and Local are configured
    if let (Some(ref local_path), Some(_)) = (&project.local_path, &project.github_url) {
        eprintln!("[Rust] Checking git status for: {}", local_path);
        let service = get_git_service()?;
        let status_info = service.check_status(local_path)
            .map_err(|e| format!("Failed to check status: {}", e))?;

        eprintln!("[Rust] Status info: uncommitted={}, unpushed={}, branches={}",
            status_info.uncommitted_files, status_info.unpushed_commits, status_info.remote_branches.len());

        let sync_status = determine_sync_status(&status_info);

        // Update git status
        project.git_status = Some(GitStatus {
            is_git_repo: true,
            has_remote: true,
            uncommitted_files: status_info.uncommitted_files,
            untracked_files: status_info.untracked_files,
            modified_files: status_info.modified_files,
            unpushed_commits: status_info.unpushed_commits,
            remote_branches: status_info.remote_branches,
            sync_status: sync_status.clone(),
            last_checked: chrono::Utc::now().to_rfc3339(),
        });

        // Update project status based on git status
        project.project_status = match sync_status {
            SyncStatus::Synced => ProjectStatus::Synced,
            SyncStatus::LocalChanges => ProjectStatus::NeedsPush,
            SyncStatus::RemoteBranches => ProjectStatus::NeedsMerge,
            SyncStatus::Both => ProjectStatus::NeedsSync,
            SyncStatus::NotConnected => ProjectStatus::Ready,
        };

        // Save updated project
        project_cache::save_project(project.clone())
            .map_err(|e| format!("Failed to save project: {}", e))?;
    }

    Ok(project)
}

/// Open a directory in VS Code
#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        // Use cmd /C to properly resolve 'code' command from PATH
        // but hide the console window with CREATE_NO_WINDOW flag
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("cmd");
        cmd.args(&["/C", "code", &path])
            .creation_flags(CREATE_NO_WINDOW);

        cmd.spawn()
            .map_err(|e| format!("Failed to open VS Code: {}. Make sure VS Code is installed and 'code' command is available in PATH.", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("code")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open VS Code: {}. Make sure VS Code is installed and 'code' command is available in PATH.", e))?;
    }

    Ok(())
}

/// Clone a GitHub repository to a local directory
#[tauri::command]
pub async fn clone_repository(
    github_url: String,
    local_path: String,
    project_id: String,
) -> Result<Project, String> {
    let service = get_git_service()?;

    // Execute clone operation
    service.clone_repository(&github_url, &local_path)
        .map_err(|e| format!("Failed to clone repository: {}", e))?;

    // Load and update the project with the new local path
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    // Update project with local path
    project.local_path = Some(local_path);
    project.project_status = ProjectStatus::Ready;

    // Save updated project
    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Create a new GitHub repository and push local repository to it
#[tauri::command]
pub async fn create_github_repository(
    project_id: String,
    repo_name: String,
    is_private: bool,
    token: String,
) -> Result<Project, String> {
    let service = get_git_service()?;

    // Load the project
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    let local_path = project.local_path.as_ref()
        .ok_or_else(|| "Project has no local path".to_string())?;

    // Create GitHub repository
    let github_url = service.create_github_repository(&token, &repo_name, is_private)
        .map_err(|e| format!("Failed to create GitHub repository: {}", e))?;

    // Parse owner and repo from URL
    let url_parts: Vec<&str> = github_url.trim_end_matches(".git").split('/').collect();
    let github_repo = url_parts.last().map(|s| s.to_string());
    let github_owner = if url_parts.len() >= 2 {
        url_parts.get(url_parts.len() - 2).map(|s| s.to_string())
    } else {
        None
    };

    // Update project with GitHub info
    project.github_url = Some(github_url);
    project.github_owner = github_owner;
    project.github_repo = github_repo;
    project.project_status = ProjectStatus::Ready;

    // Initialize git repo if not already initialized
    service.init_repository(local_path)
        .map_err(|e| format!("Failed to initialize git repository: {}", e))?;

    // Add remote and push
    service.add_remote(local_path, "origin", &project.github_url.as_ref().unwrap())
        .map_err(|e| format!("Failed to add remote: {}", e))?;

    // Push to GitHub
    service.push_to_remote(local_path, "origin", "main")
        .map_err(|e| format!("Failed to push to GitHub: {}", e))?;

    // Save updated project
    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Sync a project (replacement for sync_repository that works with projects)
#[tauri::command]
pub async fn sync_project(project_id: String, action: SyncAction) -> Result<SyncResult, String> {
    // Load project from cache
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    // Check if local path exists
    let local_path = project.local_path
        .as_ref()
        .ok_or_else(|| "Project has no local path".to_string())?;

    let service = get_git_service()?;

    // Get GitHub URL as Option<&str> for passing to git service
    let remote_url = project.github_url.as_deref();

    match action {
        SyncAction::PushLocal => {
            let result = service.push_local(local_path, remote_url)
                .map_err(|e| format!("Push failed: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: "Successfully pushed local changes".to_string(),
                details: SyncDetails {
                    committed: Some(result.committed),
                    pushed: Some(1),
                    merged: None,
                    deleted: None,
                    errors: None,
                },
            })
        }
        SyncAction::MergeBranches { branches } => {
            let merged = service.merge_branches(local_path, &branches, remote_url)
                .map_err(|e| format!("Merge failed: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: format!("Successfully merged {} branches", merged.len()),
                details: SyncDetails {
                    committed: None,
                    pushed: None,
                    merged: Some(merged.clone()),
                    deleted: Some(merged),
                    errors: None,
                },
            })
        }
        SyncAction::PullBranches { branches } => {
            let pulled = service.pull_branches(local_path, &branches, remote_url)
                .map_err(|e| format!("Pull failed: {}", e))?;

            Ok(SyncResult {
                success: true,
                message: format!("Successfully pulled {} branches", pulled.len()),
                details: SyncDetails {
                    committed: None,
                    pushed: Some(1), // Main branch is pushed
                    merged: Some(pulled.clone()),
                    deleted: None, // Branches are NOT deleted
                    errors: None,
                },
            })
        }
        SyncAction::FullSync => {
            let result = service.full_sync(local_path, remote_url)
                .map_err(|e| format!("Full sync failed: {}", e))?;

            Ok(SyncResult {
                success: result.success,
                message: result.message,
                details: SyncDetails {
                    committed: result.committed,
                    pushed: result.committed.map(|_| 1),
                    merged: result.merged.clone(),
                    deleted: result.merged,
                    errors: result.errors,
                },
            })
        }
    }
}

// ==================== ADVANCED GIT FEATURES ====================

#[tauri::command]
pub async fn git_get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let service = get_git_service()?;
    service.get_branches(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, branch_name: String, checkout: bool) -> Result<(), String> {
    let service = get_git_service()?;
    service.create_branch(&repo_path, &branch_name, checkout)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.switch_branch(&repo_path, &branch_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_delete_branch(repo_path: String, branch_name: String, force: bool) -> Result<(), String> {
    let service = get_git_service()?;
    service.delete_branch(&repo_path, &branch_name, force)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_get_commit_history(repo_path: String, limit: u32) -> Result<Vec<CommitInfo>, String> {
    let service = get_git_service()?;
    service.get_commit_history(&repo_path, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_get_diff(repo_path: String, file_path: Option<String>) -> Result<Vec<DiffInfo>, String> {
    let service = get_git_service()?;
    service.get_diff(&repo_path, file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_create_stash(repo_path: String, message: Option<String>) -> Result<(), String> {
    let service = get_git_service()?;
    service.create_stash(&repo_path, message)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_list_stashes(repo_path: String) -> Result<Vec<StashInfo>, String> {
    let service = get_git_service()?;
    service.list_stashes(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_apply_stash(repo_path: String, index: u32) -> Result<(), String> {
    let service = get_git_service()?;
    service.apply_stash(&repo_path, index)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_pop_stash(repo_path: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.pop_stash(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_drop_stash(repo_path: String, index: u32) -> Result<(), String> {
    let service = get_git_service()?;
    service.drop_stash(&repo_path, index)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_create_tag(repo_path: String, tag_name: String, message: Option<String>) -> Result<(), String> {
    let service = get_git_service()?;
    service.create_tag(&repo_path, &tag_name, message)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_list_tags(repo_path: String) -> Result<Vec<TagInfo>, String> {
    let service = get_git_service()?;
    service.list_tags(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_push_tag(repo_path: String, tag_name: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.push_tag(&repo_path, &tag_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_push_all_tags(repo_path: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.push_all_tags(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_delete_tag(repo_path: String, tag_name: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.delete_tag(&repo_path, &tag_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_cherry_pick(repo_path: String, commit_hash: String) -> Result<(), String> {
    let service = get_git_service()?;
    service.cherry_pick(&repo_path, &commit_hash)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_get_current_branch(repo_path: String) -> Result<String, String> {
    let service = get_git_service()?;
    service.get_current_branch(&repo_path)
        .map_err(|e| e.to_string())
}

// ==================== PROJECT MANAGEMENT (PRIORITY 3) ====================

/// Update project metadata (description, favorite, archived)
#[tauri::command]
pub async fn update_project_metadata(
    project_id: String,
    description: Option<String>,
    favorite: Option<bool>,
    archived: Option<bool>,
) -> Result<Project, String> {
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    // Update fields if provided
    if description.is_some() {
        project.description = description;
    }
    if favorite.is_some() {
        project.favorite = favorite;
    }
    if archived.is_some() {
        project.archived = archived;
    }

    // Update last activity
    project.last_activity = Some(chrono::Utc::now().to_rfc3339());

    // Save updated project
    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Toggle project favorite status
#[tauri::command]
pub async fn toggle_project_favorite(project_id: String) -> Result<Project, String> {
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    project.favorite = Some(!project.favorite.unwrap_or(false));
    project.last_activity = Some(chrono::Utc::now().to_rfc3339());

    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Toggle project archived status
#[tauri::command]
pub async fn toggle_project_archived(project_id: String) -> Result<Project, String> {
    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    project.archived = Some(!project.archived.unwrap_or(false));
    project.last_activity = Some(chrono::Utc::now().to_rfc3339());

    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Apply a template to a project (write .gitignore and other files)
#[tauri::command]
pub async fn apply_project_template(
    project_id: String,
    template_id: String,
    gitignore_content: String,
) -> Result<Project, String> {
    use std::fs;
    use std::path::Path;

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    // Check if local path exists
    let local_path = project.local_path
        .as_ref()
        .ok_or_else(|| "Project has no local path".to_string())?;

    // Write .gitignore file if content is provided
    if !gitignore_content.is_empty() {
        let gitignore_path = Path::new(local_path).join(".gitignore");
        fs::write(&gitignore_path, gitignore_content)
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
    }

    // Update project template
    project.template = Some(template_id);
    project.last_activity = Some(chrono::Utc::now().to_rfc3339());

    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Increment project statistics
#[tauri::command]
pub async fn increment_project_stats(
    project_id: String,
    stat_type: String,
) -> Result<Project, String> {
    use crate::models::ProjectStatistics;

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let mut project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    // Initialize statistics if not present
    if project.statistics.is_none() {
        project.statistics = Some(ProjectStatistics {
            total_syncs: 0,
            total_commits: 0,
            total_pushes: 0,
            total_merges: 0,
            total_pulls: 0,
            last_sync_date: None,
            last_commit_date: None,
        });
    }

    if let Some(ref mut stats) = project.statistics {
        let now = chrono::Utc::now().to_rfc3339();

        match stat_type.as_str() {
            "sync" => {
                stats.total_syncs += 1;
                stats.last_sync_date = Some(now.clone());
            }
            "commit" => {
                stats.total_commits += 1;
                stats.last_commit_date = Some(now.clone());
            }
            "push" => {
                stats.total_pushes += 1;
            }
            "merge" => {
                stats.total_merges += 1;
            }
            "pull" => {
                stats.total_pulls += 1;
            }
            _ => return Err(format!("Unknown stat type: {}", stat_type)),
        }
    }

    project.last_activity = Some(chrono::Utc::now().to_rfc3339());

    project_cache::save_project(project.clone())
        .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

// ==================== ANALYTICS FEATURES ====================

/// Simplified analytics data structures for Tauri commands
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsData {
    pub overview: DashboardOverview,
    pub timeline: Vec<ActivityEntry>,
    pub health: Vec<HealthIndicator>,
    pub heatmap: ContributionHeatmap,
    pub last_updated: String,
    pub generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub total_projects: usize,
    pub active_projects: usize,
    pub needs_attention: usize,
    pub commits_today: u32,
    pub commits_this_week: u32,
    pub commits_this_month: u32,
    pub total_branches: u32,
    pub total_stashes: u32,
    pub total_tags: u32,
    pub most_active_project: Option<MostActiveProject>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MostActiveProject {
    pub id: String,
    pub name: String,
    pub commit_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub project_color: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub branch: String,
    pub files_changed: u32,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthIndicator {
    pub project_id: String,
    pub project_name: String,
    pub days_since_last_commit: Option<i32>,
    pub uncommitted_changes_duration: Option<i32>,
    pub stale_branches: Vec<StaleBranchInfo>,
    pub health_status: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StaleBranchInfo {
    pub name: String,
    pub days_since_last_commit: i32,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContributionHeatmap {
    pub daily_contributions: HashMap<String, DailyContribution>,
    pub start_date: String,
    pub end_date: String,
    pub total_contributions: u32,
    pub current_streak: u32,
    pub longest_streak: u32,
    pub most_productive_day: Option<MostProductiveDay>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyContribution {
    pub date: String,
    pub count: u32,
    pub projects: Vec<String>,
    pub level: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MostProductiveDay {
    pub date: String,
    pub count: u32,
}

/// Generate comprehensive analytics for all projects
#[tauri::command]
pub async fn generate_analytics() -> Result<AnalyticsData, String> {
    use chrono::{Duration, Utc};

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let service = get_git_service()?;

    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    let week_start = today_start - Duration::days(7);
    let month_start = today_start - Duration::days(30);
    let year_start = today_start - Duration::days(365);

    // Initialize counters
    let mut total_branches = 0u32;
    let mut total_stashes = 0u32;
    let mut total_tags = 0u32;
    let mut commits_today = 0u32;
    let mut commits_this_week = 0u32;
    let mut commits_this_month = 0u32;
    let mut active_projects = 0usize;
    let mut needs_attention = 0usize;

    let mut timeline_entries: Vec<ActivityEntry> = Vec::new();
    let mut health_indicators: Vec<HealthIndicator> = Vec::new();
    let mut daily_contributions: HashMap<String, DailyContribution> = HashMap::new();
    let mut project_commit_counts: HashMap<String, u32> = HashMap::new();

    println!("[Analytics] Starting analysis of {} projects", projects.len());

    // Analyze each project
    for (idx, project) in projects.iter().enumerate() {
        // Skip projects without local paths
        let local_path = match &project.local_path {
            Some(path) => path,
            None => {
                println!("[Analytics] Skipping project {} (no local path)", project.name);
                continue;
            }
        };

        // Check if project was recently synced (active)
        if let Some(last_synced) = &project.last_synced {
            if let Ok(last_sync_time) = chrono::DateTime::parse_from_rfc3339(last_synced) {
                let last_sync_utc = last_sync_time.with_timezone(&Utc);
                let days_since = (now - last_sync_utc).num_days();
                if days_since <= 7 {
                    active_projects += 1;
                }
            }
        }

        // Check if needs attention
        if let Some(git_status) = &project.git_status {
            if git_status.uncommitted_files > 0 || git_status.remote_branches.len() > 0 {
                needs_attention += 1;
            }
        }

        // Get commit history for analytics (last 90 days)
        let since = (today_start - Duration::days(90)).format("%Y-%m-%d").to_string();
        println!("[Analytics] Fetching commits for {} since {}", project.name, since);
        match service.get_analytics_commit_history(local_path, 100, Some(since.clone()), None, None) {
            Ok(commits) => {
                println!("[Analytics] Found {} commits for {}", commits.len(), project.name);
                project_commit_counts.insert(project.id.clone(), commits.len() as u32);

                for commit in commits {
                    let commit_date = match chrono::DateTime::parse_from_rfc3339(&commit.date) {
                        Ok(dt) => dt,
                        Err(e) => {
                            println!("[Analytics] Failed to parse date '{}': {}", commit.date, e);
                            continue;
                        }
                    };

                    // Count commits by date range
                    if commit_date.naive_utc() >= today_start {
                        commits_today += 1;
                    }
                    if commit_date.naive_utc() >= week_start {
                        commits_this_week += 1;
                    }
                    if commit_date.naive_utc() >= month_start {
                        commits_this_month += 1;
                    }

                    // Add to timeline
                    timeline_entries.push(ActivityEntry {
                        id: format!("{}-{}", project.id, commit.hash),
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        project_color: format!("hsl({}, 70%, 50%)", (idx * 137) % 360),
                        commit_hash: commit.hash,
                        commit_message: commit.message,
                        author: commit.author,
                        email: commit.email,
                        date: commit.date.clone(),
                        branch: commit.branch,
                        files_changed: commit.files_changed,
                        additions: commit.additions,
                        deletions: commit.deletions,
                    });

                    // Add to heatmap
                    let date_key = commit.date.split('T').next().unwrap_or(&commit.date).to_string();
                    let entry = daily_contributions.entry(date_key.clone()).or_insert(DailyContribution {
                        date: date_key,
                        count: 0,
                        projects: Vec::new(),
                        level: 0,
                    });
                    entry.count += 1;
                    if !entry.projects.contains(&project.id) {
                        entry.projects.push(project.id.clone());
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to get commit history for {}: {}", project.name, e);
            }
        }

        // Get aggregate stats
        if let Ok(stats) = service.get_aggregate_stats(local_path) {
            total_branches += stats.total_branches;
            total_stashes += stats.total_stashes;
            total_tags += stats.total_tags;
        }

        // Get health indicators
        let days_since_last_commit = service.get_days_since_last_commit(local_path).ok().flatten();

        let mut warnings = Vec::new();
        let health_status = if let Some(days) = days_since_last_commit {
            if days > 30 {
                warnings.push(format!("No commits in {} days", days));
                "critical"
            } else if days > 14 {
                warnings.push(format!("No commits in {} days", days));
                "warning"
            } else if days > 7 {
                warnings.push(format!("No commits in {} days", days));
                "attention"
            } else {
                "healthy"
            }
        } else {
            warnings.push("No commits found".to_string());
            "attention"
        };

        // Check for uncommitted changes
        let uncommitted_duration = if let Some(git_status) = &project.git_status {
            if git_status.uncommitted_files > 0 {
                warnings.push(format!("{} uncommitted files", git_status.uncommitted_files));
                Some(24) // Placeholder: 24 hours
            } else {
                None
            }
        } else {
            None
        };

        // Get stale branches
        let stale_branches = service.get_branch_staleness(local_path)
            .ok()
            .unwrap_or_default()
            .into_iter()
            .filter(|b| b.days_since_last_commit > 30)
            .map(|b| StaleBranchInfo {
                name: b.name,
                days_since_last_commit: b.days_since_last_commit,
                is_remote: b.is_remote,
            })
            .collect::<Vec<_>>();

        if !stale_branches.is_empty() {
            warnings.push(format!("{} stale branches", stale_branches.len()));
        }

        health_indicators.push(HealthIndicator {
            project_id: project.id.clone(),
            project_name: project.name.clone(),
            days_since_last_commit,
            uncommitted_changes_duration: uncommitted_duration,
            stale_branches,
            health_status: health_status.to_string(),
            warnings,
        });
    }

    // Sort timeline by date (most recent first)
    timeline_entries.sort_by(|a, b| b.date.cmp(&a.date));

    // Calculate contribution levels for heatmap
    let max_commits = daily_contributions.values().map(|d| d.count).max().unwrap_or(1);
    for contrib in daily_contributions.values_mut() {
        contrib.level = if contrib.count == 0 {
            0
        } else if (contrib.count as f32 / max_commits as f32) < 0.25 {
            1
        } else if (contrib.count as f32 / max_commits as f32) < 0.5 {
            2
        } else if (contrib.count as f32 / max_commits as f32) < 0.75 {
            3
        } else {
            4
        };
    }

    // Calculate streaks
    let mut current_streak = 0u32;
    let mut longest_streak = 0u32;
    let mut temp_streak = 0u32;
    let mut date = now.date_naive();

    for _ in 0..365 {
        let date_key = date.format("%Y-%m-%d").to_string();
        if daily_contributions.contains_key(&date_key) {
            temp_streak += 1;
            if date == now.date_naive() || current_streak > 0 {
                current_streak = temp_streak;
            }
            longest_streak = longest_streak.max(temp_streak);
        } else {
            if current_streak > 0 {
                current_streak = 0;
            }
            temp_streak = 0;
        }
        date = date.pred_opt().unwrap();
    }

    // Find most active project
    let most_active_project = project_commit_counts
        .iter()
        .max_by_key(|(_, count)| *count)
        .and_then(|(id, count)| {
            projects.iter().find(|p| &p.id == id).map(|p| MostActiveProject {
                id: p.id.clone(),
                name: p.name.clone(),
                commit_count: *count,
            })
        });

    // Find most productive day
    let most_productive_day = daily_contributions
        .values()
        .max_by_key(|d| d.count)
        .map(|d| MostProductiveDay {
            date: d.date.clone(),
            count: d.count,
        });

    println!("[Analytics] Summary:");
    println!("  Total Projects: {}", projects.len());
    println!("  Active Projects: {}", active_projects);
    println!("  Needs Attention: {}", needs_attention);
    println!("  Commits Today: {}", commits_today);
    println!("  Commits This Week: {}", commits_this_week);
    println!("  Commits This Month: {}", commits_this_month);
    println!("  Total Branches: {}", total_branches);
    println!("  Total Stashes: {}", total_stashes);
    println!("  Total Tags: {}", total_tags);
    println!("  Timeline Entries: {}", timeline_entries.len());

    let analytics = AnalyticsData {
        overview: DashboardOverview {
            total_projects: projects.len(),
            active_projects,
            needs_attention,
            commits_today,
            commits_this_week,
            commits_this_month,
            total_branches,
            total_stashes,
            total_tags,
            most_active_project,
        },
        timeline: timeline_entries.into_iter().take(100).collect(),
        health: health_indicators,
        heatmap: ContributionHeatmap {
            daily_contributions,
            start_date: year_start.format("%Y-%m-%d").to_string(),
            end_date: now.format("%Y-%m-%d").to_string(),
            total_contributions: commits_this_month,
            current_streak,
            longest_streak,
            most_productive_day,
        },
        last_updated: now.to_rfc3339(),
        generated_at: now.to_rfc3339(),
    };

    Ok(analytics)
}

/// Generate only the dashboard overview section (fast)
#[tauri::command]
pub async fn generate_analytics_overview() -> Result<DashboardOverview, String> {
    use chrono::{Duration, Utc};

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    let service = get_git_service()?;
    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    let week_start = today_start - Duration::days(7);
    let month_start = today_start - Duration::days(30);

    let mut total_branches = 0u32;
    let mut total_stashes = 0u32;
    let mut total_tags = 0u32;
    let mut commits_today = 0u32;
    let mut commits_this_week = 0u32;
    let mut commits_this_month = 0u32;
    let mut active_projects = 0usize;
    let mut needs_attention = 0usize;
    let mut project_commit_counts: HashMap<String, u32> = HashMap::new();

    for project in projects.iter() {
        let local_path = match &project.local_path {
            Some(path) => path,
            None => continue,
        };

        // Check if project was recently synced (active)
        if let Some(last_synced) = &project.last_synced {
            if let Ok(last_sync_time) = chrono::DateTime::parse_from_rfc3339(last_synced) {
                let last_sync_utc = last_sync_time.with_timezone(&Utc);
                let days_since = (now - last_sync_utc).num_days();
                if days_since <= 7 {
                    active_projects += 1;
                }
            }
        }

        // Check if needs attention
        if let Some(git_status) = &project.git_status {
            if git_status.uncommitted_files > 0 || git_status.remote_branches.len() > 0 {
                needs_attention += 1;
            }
        }

        // Get commit counts (limited to improve speed)
        let since = (today_start - Duration::days(90)).format("%Y-%m-%d").to_string();
        if let Ok(commits) = service.get_analytics_commit_history(local_path, 100, Some(since), None, None) {
            project_commit_counts.insert(project.id.clone(), commits.len() as u32);

            for commit in commits {
                if let Ok(commit_date) = chrono::DateTime::parse_from_rfc3339(&commit.date) {
                    if commit_date.naive_utc() >= today_start {
                        commits_today += 1;
                    }
                    if commit_date.naive_utc() >= week_start {
                        commits_this_week += 1;
                    }
                    if commit_date.naive_utc() >= month_start {
                        commits_this_month += 1;
                    }
                }
            }
        }

        // Get aggregate stats
        if let Ok(stats) = service.get_aggregate_stats(local_path) {
            total_branches += stats.total_branches;
            total_stashes += stats.total_stashes;
            total_tags += stats.total_tags;
        }
    }

    let most_active_project = project_commit_counts
        .iter()
        .max_by_key(|(_, count)| *count)
        .and_then(|(id, count)| {
            projects.iter().find(|p| &p.id == id).map(|p| MostActiveProject {
                id: p.id.clone(),
                name: p.name.clone(),
                commit_count: *count,
            })
        });

    Ok(DashboardOverview {
        total_projects: projects.len(),
        active_projects,
        needs_attention,
        commits_today,
        commits_this_week,
        commits_this_month,
        total_branches,
        total_stashes,
        total_tags,
        most_active_project,
    })
}

/// Generate timeline activity entries
#[tauri::command]
pub async fn generate_analytics_timeline() -> Result<Vec<ActivityEntry>, String> {
    use chrono::{Duration, Utc};
    use std::time::Instant;

    let start_time = Instant::now();
    eprintln!("[Analytics Timeline] Starting generation...");

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    eprintln!("[Analytics Timeline] Loaded {} projects in {:?}", projects.len(), start_time.elapsed());

    let service = get_git_service()?;
    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    let since = (today_start - Duration::days(30)).format("%Y-%m-%d").to_string(); // Reduced from 90 to 30 days

    let mut timeline_entries: Vec<ActivityEntry> = Vec::new();

    for (idx, project) in projects.iter().enumerate() {
        let local_path = match &project.local_path {
            Some(path) => path,
            None => continue,
        };

        let project_start = Instant::now();
        if let Ok(commits) = service.get_analytics_commit_history(local_path, 30, Some(since.clone()), None, None) { // Reduced from 100 to 30 commits
            eprintln!("[Analytics Timeline] Project '{}': fetched {} commits in {:?}", project.name, commits.len(), project_start.elapsed());
            for commit in commits {
                timeline_entries.push(ActivityEntry {
                    id: format!("{}-{}", project.id, commit.hash),
                    project_id: project.id.clone(),
                    project_name: project.name.clone(),
                    project_color: format!("hsl({}, 70%, 50%)", (idx * 137) % 360),
                    commit_hash: commit.hash,
                    commit_message: commit.message,
                    author: commit.author,
                    email: commit.email,
                    date: commit.date,
                    branch: commit.branch,
                    files_changed: commit.files_changed,
                    additions: commit.additions,
                    deletions: commit.deletions,
                });
            }
        } else {
            eprintln!("[Analytics Timeline] Project '{}': failed to fetch commits (took {:?})", project.name, project_start.elapsed());
        }
    }

    timeline_entries.sort_by(|a, b| b.date.cmp(&a.date));
    let result = timeline_entries.into_iter().take(50).collect(); // Reduced from 100 to 50

    eprintln!("[Analytics Timeline] Total time: {:?}", start_time.elapsed());
    Ok(result)
}

/// Generate health indicators
#[tauri::command]
pub async fn generate_analytics_health() -> Result<Vec<HealthIndicator>, String> {
    use std::time::Instant;

    let start_time = Instant::now();
    eprintln!("[Analytics Health] Starting generation...");

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    eprintln!("[Analytics Health] Loaded {} projects", projects.len());

    let service = get_git_service()?;
    let mut health_indicators: Vec<HealthIndicator> = Vec::new();

    for project in projects.iter() {
        let local_path = match &project.local_path {
            Some(path) => path,
            None => continue,
        };

        let project_start = Instant::now();

        let days_since_last_commit = service.get_days_since_last_commit(local_path).ok().flatten();

        let mut warnings = Vec::new();
        let health_status = if let Some(days) = days_since_last_commit {
            if days > 30 {
                warnings.push(format!("No commits in {} days", days));
                "critical"
            } else if days > 14 {
                warnings.push(format!("No commits in {} days", days));
                "warning"
            } else if days > 7 {
                warnings.push(format!("No commits in {} days", days));
                "attention"
            } else {
                "healthy"
            }
        } else {
            warnings.push("No commits found".to_string());
            "attention"
        };

        let uncommitted_duration = if let Some(git_status) = &project.git_status {
            if git_status.uncommitted_files > 0 {
                warnings.push(format!("{} uncommitted files", git_status.uncommitted_files));
                Some(24)
            } else {
                None
            }
        } else {
            None
        };

        let stale_branches = service.get_branch_staleness(local_path)
            .ok()
            .unwrap_or_default()
            .into_iter()
            .filter(|b| b.days_since_last_commit > 30)
            .map(|b| StaleBranchInfo {
                name: b.name,
                days_since_last_commit: b.days_since_last_commit,
                is_remote: b.is_remote,
            })
            .collect::<Vec<_>>();

        if !stale_branches.is_empty() {
            warnings.push(format!("{} stale branches", stale_branches.len()));
        }

        eprintln!("[Analytics Health] Project '{}': analyzed in {:?}", project.name, project_start.elapsed());

        health_indicators.push(HealthIndicator {
            project_id: project.id.clone(),
            project_name: project.name.clone(),
            days_since_last_commit,
            uncommitted_changes_duration: uncommitted_duration,
            stale_branches,
            health_status: health_status.to_string(),
            warnings,
        });
    }

    eprintln!("[Analytics Health] Total time: {:?}", start_time.elapsed());
    Ok(health_indicators)
}

/// Generate contribution heatmap
#[tauri::command]
pub async fn generate_analytics_heatmap() -> Result<ContributionHeatmap, String> {
    use chrono::{Duration, Utc};
    use std::time::Instant;

    let start_time = Instant::now();
    eprintln!("[Analytics Heatmap] Starting generation...");

    let projects = project_cache::load_projects()
        .map_err(|e| format!("Failed to load projects: {}", e))?;

    eprintln!("[Analytics Heatmap] Loaded {} projects", projects.len());

    let service = get_git_service()?;
    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    let year_start = today_start - Duration::days(90); // Reduced from 365 to 90 days
    let since = year_start.format("%Y-%m-%d").to_string();

    let mut daily_contributions: HashMap<String, DailyContribution> = HashMap::new();

    for project in projects.iter() {
        let local_path = match &project.local_path {
            Some(path) => path,
            None => continue,
        };

        let project_start = Instant::now();
        if let Ok(commits) = service.get_analytics_commit_history(local_path, 500, Some(since.clone()), None, None) { // Reduced from 1000 to 500
            eprintln!("[Analytics Heatmap] Project '{}': fetched {} commits in {:?}", project.name, commits.len(), project_start.elapsed());
            for commit in commits {
                let date_key = commit.date.split('T').next().unwrap_or(&commit.date).to_string();
                let entry = daily_contributions.entry(date_key.clone()).or_insert(DailyContribution {
                    date: date_key,
                    count: 0,
                    projects: Vec::new(),
                    level: 0,
                });
                entry.count += 1;
                if !entry.projects.contains(&project.id) {
                    entry.projects.push(project.id.clone());
                }
            }
        } else {
            eprintln!("[Analytics Heatmap] Project '{}': failed to fetch commits (took {:?})", project.name, project_start.elapsed());
        }
    }

    // Calculate contribution levels
    let max_commits = daily_contributions.values().map(|d| d.count).max().unwrap_or(1);
    for contrib in daily_contributions.values_mut() {
        contrib.level = if contrib.count == 0 {
            0
        } else if (contrib.count as f32 / max_commits as f32) < 0.25 {
            1
        } else if (contrib.count as f32 / max_commits as f32) < 0.5 {
            2
        } else if (contrib.count as f32 / max_commits as f32) < 0.75 {
            3
        } else {
            4
        };
    }

    // Calculate streaks
    let mut current_streak = 0u32;
    let mut longest_streak = 0u32;
    let mut temp_streak = 0u32;
    let mut date = now.date_naive();

    for _ in 0..90 { // Reduced from 365 to 90 days
        let date_key = date.format("%Y-%m-%d").to_string();
        if daily_contributions.contains_key(&date_key) {
            temp_streak += 1;
            if date == now.date_naive() || current_streak > 0 {
                current_streak = temp_streak;
            }
            longest_streak = longest_streak.max(temp_streak);
        } else {
            if current_streak > 0 {
                current_streak = 0;
            }
            temp_streak = 0;
        }
        date = date.pred_opt().unwrap();
    }

    let most_productive_day = daily_contributions
        .values()
        .max_by_key(|d| d.count)
        .map(|d| MostProductiveDay {
            date: d.date.clone(),
            count: d.count,
        });

    let total_contributions: u32 = daily_contributions.values().map(|d| d.count).sum();

    eprintln!("[Analytics Heatmap] Total time: {:?}", start_time.elapsed());

    Ok(ContributionHeatmap {
        daily_contributions,
        start_date: year_start.format("%Y-%m-%d").to_string(),
        end_date: now.format("%Y-%m-%d").to_string(),
        total_contributions,
        current_streak,
        longest_streak,
        most_productive_day,
    })
}
