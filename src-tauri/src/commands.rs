use crate::credentials::CredentialManager;
use crate::git_service::{GitService, StatusInfo as GitStatusInfo, StashInfo, TagInfo, BranchInfo, CommitInfo, DiffInfo, DiffChange};
use crate::models::*;
use crate::project_cache;
use crate::scanner::RepositoryScanner;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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

    match action {
        SyncAction::PushLocal => {
            let result = service.push_local(local_path)
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
            let merged = service.merge_branches(local_path, &branches)
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
            let pulled = service.pull_branches(local_path, &branches)
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
            let result = service.full_sync(local_path)
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
        Command::new("cmd")
            .args(&["/C", "code", &path])
            .spawn()
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

    match action {
        SyncAction::PushLocal => {
            let result = service.push_local(local_path)
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
            let merged = service.merge_branches(local_path, &branches)
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
            let pulled = service.pull_branches(local_path, &branches)
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
            let result = service.full_sync(local_path)
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
