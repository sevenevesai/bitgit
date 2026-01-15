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

/// Get the backup file path
fn get_backup_path() -> Result<PathBuf> {
    let cache_path = get_cache_path()?;
    Ok(cache_path.with_extension("json.bak"))
}

/// Get the temp file path for atomic writes
fn get_temp_path() -> Result<PathBuf> {
    let cache_path = get_cache_path()?;
    Ok(cache_path.with_extension("json.tmp"))
}

/// Validate that JSON content can be parsed as a project list
/// Returns the parsed projects if valid, None if invalid
fn validate_json_content(json: &str) -> Option<Vec<Project>> {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<Vec<Project>>(trimmed).ok()
}

/// Try to read and validate a file, returning projects if successful
fn try_read_valid_file(path: &PathBuf) -> Option<Vec<Project>> {
    if !path.exists() {
        return None;
    }

    let json = fs::read_to_string(path).ok()?;
    validate_json_content(&json)
}

/// Save projects to cache file using atomic write with backup
///
/// This function ensures data integrity through:
/// 1. Serialize and validate data before writing
/// 2. Write to a temp file first
/// 3. Verify the temp file is readable and valid
/// 4. Backup current file (if valid) before replacing
/// 5. Atomic rename of temp to main file
pub fn save_projects(projects: &[Project]) -> Result<()> {
    let cache_path = get_cache_path()?;
    let backup_path = get_backup_path()?;
    let temp_path = get_temp_path()?;

    // Step 1: Serialize to JSON
    let json = serde_json::to_string_pretty(projects)
        .context("Failed to serialize projects")?;

    // Step 2: Validate what we're about to write (sanity check)
    if projects.len() > 0 && validate_json_content(&json).is_none() {
        return Err(anyhow::anyhow!(
            "Internal error: serialized JSON failed validation"
        ));
    }

    // Step 3: Write to temp file
    fs::write(&temp_path, &json)
        .context("Failed to write temp file")?;

    // Step 4: Verify temp file by reading it back
    let verification = try_read_valid_file(&temp_path);
    if projects.len() > 0 && verification.is_none() {
        // Clean up failed temp file
        let _ = fs::remove_file(&temp_path);
        return Err(anyhow::anyhow!(
            "Write verification failed: temp file is not valid"
        ));
    }

    // Step 5: Backup current file if it exists and is valid
    if cache_path.exists() {
        if try_read_valid_file(&cache_path).is_some() {
            // Current file is valid, back it up
            // Use copy instead of rename so we don't lose data if rename fails
            if let Err(e) = fs::copy(&cache_path, &backup_path) {
                eprintln!("[ProjectCache] Warning: Could not create backup: {}", e);
                // Continue anyway - we still have the valid temp file
            }
        }
        // If current file is invalid, don't back it up (preserve any existing good backup)
    }

    // Step 6: Atomic rename temp -> main
    // On Windows, we need to remove the destination first if it exists
    if cache_path.exists() {
        fs::remove_file(&cache_path)
            .context("Failed to remove old cache file")?;
    }

    fs::rename(&temp_path, &cache_path)
        .context("Failed to rename temp file to cache file")?;

    eprintln!(
        "[ProjectCache] Saved {} projects to {:?}",
        projects.len(),
        cache_path
    );
    Ok(())
}

/// Load projects from cache file with automatic recovery
///
/// This function provides resilient loading through:
/// 1. Try to load from main file
/// 2. If main is corrupted/empty, silently try backup
/// 3. If backup works, restore it as the main file
/// 4. Only return empty list if both are unavailable
pub fn load_projects() -> Result<Vec<Project>> {
    let cache_path = get_cache_path()?;
    let backup_path = get_backup_path()?;

    // Try main file first
    if let Some(projects) = try_read_valid_file(&cache_path) {
        eprintln!(
            "[ProjectCache] Loaded {} projects from {:?}",
            projects.len(),
            cache_path
        );
        return Ok(projects);
    }

    // Main file missing or corrupted - try backup
    if let Some(projects) = try_read_valid_file(&backup_path) {
        eprintln!(
            "[ProjectCache] Recovered {} projects from backup",
            projects.len()
        );

        // Silently restore backup as main file
        if let Err(e) = restore_from_backup(&cache_path, &backup_path, &projects) {
            eprintln!("[ProjectCache] Warning: Could not restore backup: {}", e);
            // Return the recovered projects anyway
        }

        return Ok(projects);
    }

    // No valid data found - check if files exist to log appropriate message
    if cache_path.exists() || backup_path.exists() {
        eprintln!("[ProjectCache] Cache files exist but are invalid, starting fresh");
    } else {
        eprintln!("[ProjectCache] No cache files found, starting fresh");
    }

    Ok(Vec::new())
}

/// Restore backup file as the main cache file
fn restore_from_backup(
    cache_path: &PathBuf,
    backup_path: &PathBuf,
    projects: &[Project],
) -> Result<()> {
    // Re-save the recovered projects properly (this creates a fresh valid main file)
    let json = serde_json::to_string_pretty(projects)
        .context("Failed to serialize recovered projects")?;

    let temp_path = get_temp_path()?;

    // Write to temp first
    fs::write(&temp_path, &json)
        .context("Failed to write temp file during recovery")?;

    // Verify
    if try_read_valid_file(&temp_path).is_none() {
        let _ = fs::remove_file(&temp_path);
        return Err(anyhow::anyhow!("Recovery verification failed"));
    }

    // Remove corrupted main file if it exists
    if cache_path.exists() {
        let _ = fs::remove_file(cache_path);
    }

    // Rename temp to main
    fs::rename(&temp_path, cache_path)
        .context("Failed to restore cache file")?;

    eprintln!("[ProjectCache] Successfully restored {} projects from backup", projects.len());
    Ok(())
}

/// Add or update a project in the cache
pub fn save_project(project: Project) -> Result<()> {
    let mut projects = load_projects()?;

    // Find and update existing project, or add new one
    if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
        *existing = project;
    } else {
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
        save_projects(&projects)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_json_content() {
        // Empty content
        assert!(validate_json_content("").is_none());
        assert!(validate_json_content("   ").is_none());

        // Invalid JSON
        assert!(validate_json_content("not json").is_none());
        assert!(validate_json_content("{").is_none());

        // Valid empty array
        assert!(validate_json_content("[]").is_some());
        assert_eq!(validate_json_content("[]").unwrap().len(), 0);
    }
}
