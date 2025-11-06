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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
