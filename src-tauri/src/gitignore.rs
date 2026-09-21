use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const MAX_BYTES: usize = 4 * 1024 * 1024;

fn read_existing(file: &Path) -> Result<Option<Vec<u8>>, String> {
    let metadata = match fs::symlink_metadata(file) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not inspect .gitignore: {error}")),
    };
    #[cfg(windows)]
    let linked = {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0 // Any reparse point, including junctions.
    };
    #[cfg(not(windows))]
    let linked = metadata.file_type().is_symlink();
    if linked || !metadata.is_file() {
        return Err("The .gitignore path must be a regular file, not a link or folder".into());
    }
    if metadata.permissions().readonly() {
        return Err("The existing .gitignore is read-only; its contents were kept".into());
    }
    let mut bytes = Vec::new();
    File::open(file)
        .and_then(|file| file.take((MAX_BYTES + 1) as u64).read_to_end(&mut bytes))
        .map_err(|error| format!("Could not read existing .gitignore; its contents were kept: {error}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("The existing .gitignore exceeds 4 MiB; edit it directly".into());
    }
    Ok(Some(bytes))
}

struct IgnoreLock {
    path: PathBuf,
    file: Option<File>,
    published: bool,
}

impl Drop for IgnoreLock {
    fn drop(&mut self) {
        self.file.take();
        if !self.published {
            let _ = fs::remove_file(&self.path);
        }
    }
}

// Only the saved project's root .gitignore can be changed. An exclusive lock and a final
// reread avoid replacing an editor's intervening changes; existing bytes are never trimmed.
pub fn append_patterns(repo: &Path, patterns: &[String]) -> Result<usize, String> {
    if patterns.is_empty() || patterns.len() > 256 || patterns.iter().any(|pattern| {
        pattern.is_empty() || pattern.len() > 2048 || pattern.chars().any(char::is_control)
            || pattern.starts_with(['!', '#'])
    }) {
        return Err("Choose between 1 and 256 nonempty ignore patterns without control characters or negations".into());
    }
    let root = fs::canonicalize(repo).map_err(|error| format!("Could not open the project folder: {error}"))?;
    if !root.is_dir() {
        return Err("The saved project path is not a folder".into());
    }
    let target = root.join(".gitignore");
    let lock_path = root.join(".gitignore.lock");
    let file = OpenOptions::new().write(true).create_new(true).open(&lock_path)
        .map_err(|error| format!("Could not reserve .gitignore.lock; another edit may be active: {error}"))?;
    let mut lock = IgnoreLock { path: lock_path, file: Some(file), published: false };
    let original = read_existing(&target)?;
    let mut combined = original.clone().unwrap_or_default();
    let text = String::from_utf8_lossy(&combined);
    let mut existing: HashSet<String> = text.lines().map(str::to_owned).collect();
    let additions: Vec<&str> = patterns.iter().filter(|pattern| existing.insert((*pattern).clone())).map(String::as_str).collect();
    if additions.is_empty() {
        return Ok(0);
    }
    let newline = if combined.windows(2).any(|bytes| bytes == b"\r\n") { "\r\n" } else { "\n" };
    if !combined.is_empty() && !combined.ends_with(b"\n") {
        combined.extend_from_slice(newline.as_bytes());
    }
    combined.extend_from_slice(format!("# Added by BitGit{newline}{}{newline}", additions.join(newline)).as_bytes());
    if combined.len() > MAX_BYTES {
        return Err("The updated .gitignore would exceed 4 MiB; existing rules were kept".into());
    }
    let file = lock.file.as_mut().expect("lock file is open");
    file.write_all(&combined).and_then(|_| file.sync_all())
        .map_err(|error| format!("Could not prepare .gitignore; existing rules were kept: {error}"))?;
    lock.file.take();
    if read_existing(&target)? != original {
        return Err("The .gitignore changed during this edit; its newer contents were kept. Retry.".into());
    }
    if original.is_some() {
        fs::rename(&lock.path, &target)
            .map_err(|error| format!("Could not replace .gitignore; existing rules were kept: {error}"))?;
        lock.published = true;
    } else {
        // Linking an already-written file creates the destination exclusively. A concurrent
        // creator wins instead of being overwritten by a rename.
        fs::hard_link(&lock.path, &target)
            .map_err(|error| format!("Could not create .gitignore; any existing file was kept: {error}"))?;
    }
    Ok(additions.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("bitgit-ignore-{}-{}", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn target(&self) -> PathBuf { self.0.join(".gitignore") }
        fn append(&self, patterns: &[&str]) -> Result<usize, String> {
            append_patterns(&self.0, &patterns.iter().map(|pattern| pattern.to_string()).collect::<Vec<_>>())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert!(self.0.starts_with(std::env::temp_dir()));
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn preserves_bytes_line_endings_and_deduplicates() {
        let fixture = Fixture::new();
        let before = b"# Existing \xff bytes\r\nnotes.local\r\n\r\n";
        fs::write(fixture.target(), before).unwrap();
        assert_eq!(fixture.append(&["notes.local", ".env", ".env"]).unwrap(), 1);
        let after = fs::read(fixture.target()).unwrap();
        assert!(after.starts_with(before));
        assert!(after.ends_with(b"# Added by BitGit\r\n.env\r\n"));
        assert_eq!(fixture.append(&[".env"]).unwrap(), 0);
        assert_eq!(fs::read(fixture.target()).unwrap(), after);
        assert!(!fixture.0.join(".gitignore.lock").exists());
    }

    #[test]
    fn creates_missing_file_and_separates_unterminated_rule() {
        let fixture = Fixture::new();
        fixture.append(&[".env"]).unwrap();
        assert_eq!(fs::read(fixture.target()).unwrap(), b"# Added by BitGit\n.env\n");
        fs::write(fixture.target(), "existing").unwrap();
        fixture.append(&[".env"]).unwrap();
        assert_eq!(fs::read(fixture.target()).unwrap(), b"existing\n# Added by BitGit\n.env\n");
    }

    #[test]
    fn refuses_nonfiles_and_preserves_another_editors_lock() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.target()).unwrap();
        assert!(fixture.append(&[".env"]).unwrap_err().contains("regular file"));
        fs::write(fixture.0.join(".gitignore.lock"), "another editor").unwrap();
        assert!(fixture.append(&[".env"]).is_err());
        assert_eq!(fs::read(fixture.0.join(".gitignore.lock")).unwrap(), b"another editor");
    }

    #[test]
    fn rejects_multiline_input_before_creating_files() {
        let fixture = Fixture::new();
        for patterns in [&[".env\n!secret"][..], &["!secret"], &[""]] {
            assert!(fixture.append(patterns).is_err());
        }
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    #[test]
    fn replacing_a_hard_link_leaves_the_other_file_unchanged() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        fs::write(outside.target(), "shared rules").unwrap();
        fs::hard_link(outside.target(), fixture.target()).unwrap();
        fixture.append(&[".env"]).unwrap();
        assert_eq!(fs::read(outside.target()).unwrap(), b"shared rules");
        assert!(fs::read(fixture.target()).unwrap().ends_with(b".env\n"));
    }

    #[cfg(windows)]
    #[test]
    fn unreadable_existing_file_is_never_treated_as_missing() {
        use std::os::windows::fs::OpenOptionsExt;
        let fixture = Fixture::new();
        fs::write(fixture.target(), "keep existing rules").unwrap();
        let held = OpenOptions::new().read(true).share_mode(0).open(fixture.target()).unwrap();
        let error = fixture.append(&[".env"]).unwrap_err();
        assert!(error.contains("kept"), "{error}");
        drop(held);
        assert_eq!(fs::read(fixture.target()).unwrap(), b"keep existing rules");
        assert!(!fixture.0.join(".gitignore.lock").exists());
    }
}
