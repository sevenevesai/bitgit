use crate::models::Project;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

// Serializes every cache read and write in this process. Loading can rewrite the main
// file from the backup and every save reuses one `.tmp` path, so readers take the lock
// too; without it a load racing a save restores stale data over the fresh file.
// Two BitGit processes on the same data directory are not coordinated.
static CACHE_LOCK: Mutex<()> = Mutex::new(());

fn lock_cache() -> MutexGuard<'static, ()> {
    // Files are replaced atomically, so a panic while holding the lock leaves no
    // half-written state behind and the guard can be reused safely.
    CACHE_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Locations of the cache files. `in_dir` lets tests use a disposable directory.
pub struct ProjectStore {
    dir: PathBuf,
}

impl ProjectStore {
    pub fn in_dir(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn default_location() -> Result<Self> {
        let dir = dirs::config_dir()
            .context("Failed to get config directory")?
            .join("BitGit");
        Ok(Self::in_dir(dir))
    }

    fn cache_path(&self) -> PathBuf {
        self.dir.join("projects.json")
    }

    fn backup_path(&self) -> PathBuf {
        self.cache_path().with_extension("json.bak")
    }

    fn temp_path(&self) -> PathBuf {
        self.cache_path().with_extension("json.tmp")
    }

    /// Load projects with automatic recovery from the backup.
    pub fn load(&self) -> Vec<Project> {
        let _guard = lock_cache();
        self.load_locked()
    }

    /// Run a read-modify-write as one step. The file is rewritten only if `f` changed
    /// the list. `f` must not call back into the cache (the lock is not reentrant).
    pub fn modify<R>(&self, f: impl FnOnce(&mut Vec<Project>) -> R) -> Result<R> {
        let _guard = lock_cache();
        let mut projects = self.load_locked();
        let before = projects.clone();
        let result = f(&mut projects);
        if projects != before {
            self.write_locked(&projects)?;
        }
        Ok(result)
    }

    /// Add or replace a project by id.
    pub fn upsert(&self, project: Project) -> Result<()> {
        self.modify(|projects| {
            if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
                *existing = project;
            } else {
                projects.push(project);
            }
        })
    }

    /// Mutate one stored project in place, so fields other callers changed while a
    /// slow operation ran are kept. Returns the updated project.
    pub fn update(&self, project_id: &str, f: impl FnOnce(&mut Project)) -> Result<Project> {
        self.modify(|projects| {
            projects.iter_mut().find(|p| p.id == project_id).map(|project| {
                f(project);
                project.clone()
            })
        })?
        .ok_or_else(|| anyhow::anyhow!("Project not found: {}", project_id))
    }

    pub fn delete(&self, project_id: &str) -> Result<()> {
        self.modify(|projects| projects.retain(|p| p.id != project_id))
    }

    fn load_locked(&self) -> Vec<Project> {
        let cache_path = self.cache_path();
        let backup_path = self.backup_path();

        // Try main file first
        if let Some(projects) = try_read_valid_file(&cache_path) {
            eprintln!(
                "[ProjectCache] Loaded {} projects from {:?}",
                projects.len(),
                cache_path
            );
            return projects;
        }

        // Main file missing or corrupted - try backup
        if let Some(projects) = try_read_valid_file(&backup_path) {
            eprintln!(
                "[ProjectCache] Recovered {} projects from backup",
                projects.len()
            );

            // Silently restore backup as main file
            if let Err(e) = self.restore_from_backup(&projects) {
                eprintln!("[ProjectCache] Warning: Could not restore backup: {}", e);
                // Return the recovered projects anyway
            }

            return projects;
        }

        // No valid data found - check if files exist to log appropriate message
        if cache_path.exists() || backup_path.exists() {
            eprintln!("[ProjectCache] Cache files exist but are invalid, starting fresh");
        } else {
            eprintln!("[ProjectCache] No cache files found, starting fresh");
        }

        Vec::new()
    }

    /// Save projects to the cache file using atomic write with backup
    ///
    /// This function ensures data integrity through:
    /// 1. Serialize and validate data before writing
    /// 2. Write to a temp file first
    /// 3. Verify the temp file is readable and valid
    /// 4. Backup current file (if valid) before replacing
    /// 5. Atomic rename of temp to main file
    fn write_locked(&self, projects: &[Project]) -> Result<()> {
        let cache_path = self.cache_path();
        let backup_path = self.backup_path();
        let temp_path = self.temp_path();

        fs::create_dir_all(&self.dir).context("Failed to create config directory")?;

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

    /// Restore backup file as the main cache file
    fn restore_from_backup(&self, projects: &[Project]) -> Result<()> {
        let cache_path = self.cache_path();

        // Re-save the recovered projects properly (this creates a fresh valid main file)
        let json = serde_json::to_string_pretty(projects)
            .context("Failed to serialize recovered projects")?;

        let temp_path = self.temp_path();

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
            let _ = fs::remove_file(&cache_path);
        }

        // Rename temp to main
        fs::rename(&temp_path, &cache_path)
            .context("Failed to restore cache file")?;

        eprintln!("[ProjectCache] Successfully restored {} projects from backup", projects.len());
        Ok(())
    }
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

/// Load projects from the cache file with automatic recovery
///
/// 1. Try to load from main file
/// 2. If main is corrupted/empty, silently try backup
/// 3. If backup works, restore it as the main file
/// 4. Only return empty list if both are unavailable
pub fn load_projects() -> Result<Vec<Project>> {
    Ok(ProjectStore::default_location()?.load())
}

/// Add or update a project in the cache
pub fn save_project(project: Project) -> Result<()> {
    ProjectStore::default_location()?.upsert(project)
}

/// Update one project in place; see [`ProjectStore::update`].
pub fn update_project(project_id: &str, f: impl FnOnce(&mut Project)) -> Result<Project> {
    ProjectStore::default_location()?.update(project_id, f)
}

/// Read-modify-write the whole list as one step; see [`ProjectStore::modify`].
pub fn modify_projects<R>(f: impl FnOnce(&mut Vec<Project>) -> R) -> Result<R> {
    ProjectStore::default_location()?.modify(f)
}

/// Delete a project from the cache
pub fn delete_project(project_id: &str) -> Result<()> {
    ProjectStore::default_location()?.delete(project_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ProjectStatistics, ProjectStatus};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    // Disposable data directory; never the real APPDATA.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            static COUNTER: AtomicUsize = AtomicUsize::new(0);
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!(
                "bitgit-test-{}-{}-{}-{}",
                label,
                std::process::id(),
                nanos,
                COUNTER.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            // Best-effort cleanup of a directory this test created under the temp dir.
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample_project(id: &str) -> Project {
        Project {
            id: id.to_string(),
            name: id.to_string(),
            github_owner: None,
            github_repo: None,
            github_url: None,
            local_path: Some(format!("C:/src/{}", id)),
            project_status: ProjectStatus::LocalOnly,
            git_status: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            last_synced: None,
            description: None,
            archived: None,
            favorite: None,
            last_activity: None,
            statistics: None,
            template: None,
        }
    }

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

    #[test]
    fn upserted_projects_survive_a_fresh_store_and_keep_a_backup() {
        let tmp = TempDir::new("roundtrip");
        let store = ProjectStore::in_dir(&tmp.0);
        store.upsert(sample_project("a")).unwrap();
        store.upsert(sample_project("b")).unwrap();

        // A new store over the same directory models an app restart.
        let reloaded = ProjectStore::in_dir(&tmp.0).load();
        let ids: Vec<&str> = reloaded.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "b"]);
        assert!(store.backup_path().exists());
    }

    #[test]
    fn corrupt_main_file_recovers_from_backup_and_is_rewritten() {
        let tmp = TempDir::new("recover");
        let store = ProjectStore::in_dir(&tmp.0);
        store.upsert(sample_project("a")).unwrap();
        store.upsert(sample_project("b")).unwrap();

        fs::write(store.cache_path(), "{ not valid json").unwrap();

        let recovered = store.load();
        assert!(!recovered.is_empty(), "backup should have been used");
        assert!(try_read_valid_file(&store.cache_path()).is_some(), "main file restored");
    }

    #[test]
    fn caches_written_by_older_versions_still_load() {
        let tmp = TempDir::new("oldcache");
        let store = ProjectStore::in_dir(&tmp.0);
        let old = r#"[{
            "id": "old-1", "name": "old",
            "githubOwner": null, "githubRepo": null, "githubUrl": null,
            "localPath": "C:/src/old", "projectStatus": "synced",
            "gitStatus": {
                "isGitRepo": true, "hasRemote": true, "uncommittedFiles": 0,
                "untrackedFiles": 0, "modifiedFiles": [], "unpushedCommits": 0,
                "remoteBranches": [], "syncStatus": "notconnected",
                "lastChecked": "2026-01-01T00:00:00Z"
            },
            "createdAt": "2026-01-01T00:00:00Z", "lastSynced": null
        }]"#;
        fs::write(store.cache_path(), old).unwrap();

        let loaded = store.load();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "old-1");
    }

    #[test]
    fn update_changes_only_the_target_and_reports_missing_ids() {
        let tmp = TempDir::new("update");
        let store = ProjectStore::in_dir(&tmp.0);
        store.upsert(sample_project("a")).unwrap();
        store.upsert(sample_project("b")).unwrap();

        let updated = store.update("a", |p| p.favorite = Some(true)).unwrap();
        assert_eq!(updated.favorite, Some(true));

        let loaded = store.load();
        assert_eq!(loaded[0].favorite, Some(true));
        assert_eq!(loaded[1].favorite, None);

        let err = store.update("missing", |_| {}).unwrap_err();
        assert!(err.to_string().contains("Project not found: missing"));
    }

    #[test]
    fn unchanged_modify_does_not_write() {
        let tmp = TempDir::new("nowrite");
        let store = ProjectStore::in_dir(&tmp.0);
        store.modify(|_| ()).unwrap();
        assert!(!store.cache_path().exists());
    }

    #[test]
    fn concurrent_updates_do_not_lose_increments() {
        let tmp = TempDir::new("lostupdate");
        let store = Arc::new(ProjectStore::in_dir(&tmp.0));
        let mut project = sample_project("counter");
        project.statistics = Some(ProjectStatistics {
            total_syncs: 0,
            total_commits: 0,
            total_pushes: 0,
            total_merges: 0,
            total_pulls: 0,
            last_sync_date: None,
            last_commit_date: None,
        });
        store.upsert(project).unwrap();

        let threads = 8;
        let per_thread = 20;
        let handles: Vec<_> = (0..threads)
            .map(|_| {
                let store = Arc::clone(&store);
                std::thread::spawn(move || {
                    for _ in 0..per_thread {
                        store
                            .update("counter", |p| {
                                if let Some(stats) = p.statistics.as_mut() {
                                    stats.total_syncs += 1;
                                }
                            })
                            .unwrap();
                    }
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }

        let loaded = store.load();
        let syncs = loaded[0].statistics.as_ref().unwrap().total_syncs;
        assert_eq!(syncs, threads * per_thread);
    }

    #[test]
    fn concurrent_upserts_of_different_projects_all_persist() {
        let tmp = TempDir::new("upserts");
        let store = Arc::new(ProjectStore::in_dir(&tmp.0));

        let handles: Vec<_> = (0..8)
            .map(|t| {
                let store = Arc::clone(&store);
                std::thread::spawn(move || {
                    for i in 0..5 {
                        store.upsert(sample_project(&format!("p-{}-{}", t, i))).unwrap();
                    }
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(store.load().len(), 40);
        assert!(!store.temp_path().exists(), "no stray temp file left behind");
    }

    #[test]
    fn delete_removes_only_the_named_project() {
        let tmp = TempDir::new("delete");
        let store = ProjectStore::in_dir(&tmp.0);
        store.upsert(sample_project("a")).unwrap();
        store.upsert(sample_project("b")).unwrap();
        store.delete("a").unwrap();
        let ids: Vec<String> = store.load().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["b".to_string()]);
    }
}
