use std::fs::File;
use std::path::Path;

// The resource two BitGit processes corrupt is the data directory, so the lock lives inside it.
pub struct InstanceLock {
    // Held for the life of the process: opened without sharing on Windows, flocked elsewhere. The
    // OS closes it when the process dies, so a crash never leaves a lock that blocks the next start.
    _file: Option<File>,
}

#[derive(Debug)]
pub struct AlreadyRunning;

#[cfg(windows)]
pub fn acquire(data_dir: &Path) -> Result<InstanceLock, AlreadyRunning> {
    use std::os::windows::fs::OpenOptionsExt;
    const ERROR_SHARING_VIOLATION: i32 = 32;

    let opened = std::fs::create_dir_all(data_dir).and_then(|()| {
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .share_mode(0)
            .open(data_dir.join("instance.lock"))
    });
    match opened {
        Ok(file) => Ok(InstanceLock { _file: Some(file) }),
        Err(error) if error.raw_os_error() == Some(ERROR_SHARING_VIOLATION) => Err(AlreadyRunning),
        Err(error) => {
            // Fail open: refusing to start over an unrelated filesystem error would brick the app,
            // while running unguarded only loses the single-instance check.
            eprintln!("BitGit instance lock unavailable, starting without it: {error}");
            Ok(InstanceLock { _file: None })
        }
    }
}

// An advisory flock, released with the file. Windows keeps share_mode(0): a LockFileEx lock can
// outlive a crashed process for a while.
#[cfg(not(windows))]
pub fn acquire(data_dir: &Path) -> Result<InstanceLock, AlreadyRunning> {
    let opened = std::fs::create_dir_all(data_dir).and_then(|()| {
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(data_dir.join("instance.lock"))
    });
    let locked = opened.map_err(std::fs::TryLockError::Error).and_then(|file| file.try_lock().map(|()| file));
    match locked {
        Ok(file) => Ok(InstanceLock { _file: Some(file) }),
        Err(std::fs::TryLockError::WouldBlock) => Err(AlreadyRunning),
        Err(std::fs::TryLockError::Error(error)) => {
            // Fail open, as on Windows.
            eprintln!("BitGit instance lock unavailable, starting without it: {error}");
            Ok(InstanceLock { _file: None })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Disposable data directory; never the real APPDATA.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            static COUNTER: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().join(format!(
                "bitgit-lock-test-{}-{}-{}",
                label,
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            // Best-effort cleanup of a directory this test created under the temp dir.
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_second_acquire_on_the_same_directory_reports_already_running() {
        let tmp = TempDir::new("same");
        let _first = acquire(&tmp.0).expect("first acquire holds the lock");
        assert!(matches!(acquire(&tmp.0), Err(AlreadyRunning)));
    }

    #[test]
    fn the_lock_is_free_again_once_the_holder_is_dropped() {
        let tmp = TempDir::new("released");
        drop(acquire(&tmp.0).expect("first acquire holds the lock"));
        let _second = acquire(&tmp.0).expect("the lock is free after the drop");
        // An unguarded fail-open start is also Ok, so prove this one really holds the lock.
        assert!(matches!(acquire(&tmp.0), Err(AlreadyRunning)));
    }

    #[test]
    fn different_directories_are_independent() {
        let (one, two) = (TempDir::new("one"), TempDir::new("two"));
        let _first = acquire(&one.0).expect("first directory locks");
        assert!(acquire(&two.0).is_ok());
    }

    #[test]
    fn an_unrelated_failure_starts_unguarded_instead_of_refusing() {
        let tmp = TempDir::new("notadir");
        let file = tmp.0.join("occupied");
        std::fs::write(&file, b"").unwrap();
        assert!(acquire(&file).is_ok());
    }
}
