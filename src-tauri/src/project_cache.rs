use crate::models::Project;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

/// Get the path to the projects cache file
fn get_cache_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Failed to get config directory")?
        .join("BitGit");

    // Ensure directory exists
    fs::create_dir_all(&config_dir)
        .context("Failed to create config directory")?;

    Ok(config_dir.join("projects.json"))
}

/// Save projects to cache file
pub fn save_projects(projects: &[Project]) -> Result<()> {
    let cache_path = get_cache_path()?;
    let json = serde_json::to_string_pretty(projects)
        .context("Failed to serialize projects")?;

    fs::write(&cache_path, json)
        .context("Failed to write projects cache")?;

    eprintln!("[ProjectCache] Saved {} projects to {:?}", projects.len(), cache_path);
    Ok(())
}

/// Load projects from cache file
pub fn load_projects() -> Result<Vec<Project>> {
    let cache_path = get_cache_path()?;

    // If cache file doesn't exist, return empty list
    if !cache_path.exists() {
        eprintln!("[ProjectCache] No cache file found, returning empty list");
        return Ok(Vec::new());
    }

    let json = fs::read_to_string(&cache_path)
        .context("Failed to read projects cache")?;

    let projects: Vec<Project> = serde_json::from_str(&json)
        .context("Failed to deserialize projects")?;

    eprintln!("[ProjectCache] Loaded {} projects from {:?}", projects.len(), cache_path);
    Ok(projects)
}

/// Add or update a project in the cache
pub fn save_project(project: Project) -> Result<()> {
    let mut projects = load_projects()?;

    // Find and update existing project, or add new one
    if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
        *existing = project;
        eprintln!("[ProjectCache] Updated project: {}", existing.name);
    } else {
        eprintln!("[ProjectCache] Added new project: {}", project.name);
        projects.push(project);
    }

    save_projects(&projects)?;
    Ok(())
}

/// Delete a project from the cache
pub fn delete_project(project_id: &str) -> Result<()> {
    let mut projects = load_projects()?;
    let initial_len = projects.len();

    projects.retain(|p| p.id != project_id);

    if projects.len() < initial_len {
        eprintln!("[ProjectCache] Deleted project: {}", project_id);
        save_projects(&projects)?;
    }

    Ok(())
}
