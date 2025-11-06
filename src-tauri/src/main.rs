// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod credentials;
mod git_service;
mod models;
mod project_cache;
mod scanner;

use commands::*;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            get_repositories,
            sync_repository,
            check_repository_status,
            save_github_token,
            get_stored_github_credentials,
            get_github_token,
            has_github_token,
            verify_github_token,
            scan_directories,
            add_repositories,
            fetch_github_repos,
            // New project management commands
            load_projects,
            create_project,
            update_project,
            delete_project,
            check_project_status,
            // Project actions
            open_in_vscode,
            clone_repository,
            create_github_repository,
            sync_project,
            // Advanced Git features
            git_get_branches,
            git_create_branch,
            git_switch_branch,
            git_delete_branch,
            git_get_commit_history,
            git_get_diff,
            git_create_stash,
            git_list_stashes,
            git_apply_stash,
            git_pop_stash,
            git_drop_stash,
            git_create_tag,
            git_list_tags,
            git_push_tag,
            git_push_all_tags,
            git_delete_tag,
            git_cherry_pick,
            git_get_current_branch,
            // Project Management (Priority 3)
            update_project_metadata,
            toggle_project_favorite,
            toggle_project_archived,
            apply_project_template,
            increment_project_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
