// An app started from Finder or a desktop menu inherits launchd's or the session's minimal PATH, so
// `node`, Homebrew `git` and editor commands installed through Homebrew, nvm, fnm or volta are not
// found. The login shell's PATH is what the user's terminal sees.
//
// Only Unix uses this. The parsing and merging below stay portable so Windows builds and tests
// cover them too.
#![cfg_attr(not(unix), allow(dead_code))]

use std::ffi::{OsStr, OsString};
use std::io::{IsTerminal, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;

const START: &str = "__BITGIT_PATH_START__";
const END: &str = "__BITGIT_PATH_END__";
const SHELL_TIMEOUT: Duration = Duration::from_secs(10);

/// PATH for every child process: the login shell's, then the inherited one, then common install
/// directories. Computed once. Callers pass it to each `Command`, because `set_var` is unsound
/// once other threads run.
pub fn login_path() -> &'static OsStr {
    static PATH: OnceLock<OsString> = OnceLock::new();
    PATH.get_or_init(|| {
        let inherited = std::env::var_os("PATH");
        // A terminal launch already has the shell's PATH, and an interactive child shell could take
        // over that terminal.
        let from_shell = if std::io::stdin().is_terminal() { None } else { read_login_shell_path() };
        merge_paths([from_shell.as_deref(), inherited.as_deref()], &fallback_dirs())
            .unwrap_or_else(|| inherited.unwrap_or_default())
    })
}

fn fallback_dirs() -> Vec<PathBuf> {
    let mut fallbacks = vec![PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin")];
    if let Some(home) = dirs::home_dir() {
        fallbacks.push(home.join(".volta").join("bin"));
        fallbacks.push(home.join(".local").join("bin"));
    }
    fallbacks
}

// Interactive as well as login, because nvm and fnm are set up in rc files that only interactive
// shells read. `printenv` reports PATH the same way under bash, zsh, fish and dash; the sentinels
// separate it from anything the rc files print.
fn read_login_shell_path() -> Option<OsString> {
    let shell = std::env::var_os("SHELL").filter(|shell| !shell.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let mut child = match Command::new(&shell)
        .args(["-ilc", &format!("echo {START}; printenv PATH; echo {END}")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            eprintln!("[Rust] Could not run {} for the login PATH: {}", shell.to_string_lossy(), error);
            return None;
        }
    };

    // Read on a thread so a shell that never exits, or a background job holding the pipe open,
    // costs at most the timeout.
    let mut stdout = child.stdout.take()?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let read = stdout.read_to_end(&mut output).map(|_| output);
        // The receiver is gone only after a timeout, when the output is no longer wanted.
        let _ = sender.send(read);
    });
    let output = receiver.recv_timeout(SHELL_TIMEOUT);
    // Ends a shell that is still running; after a normal exit this only reaps it.
    let _ = child.kill();
    let _ = child.wait();

    let path = match output {
        Ok(Ok(output)) => std::str::from_utf8(&output).ok().and_then(path_between_sentinels).map(OsString::from),
        Ok(Err(error)) => {
            eprintln!("[Rust] Could not read the login PATH from {}: {}", shell.to_string_lossy(), error);
            None
        }
        Err(_) => {
            eprintln!("[Rust] {} did not report the login PATH within {} s", shell.to_string_lossy(), SHELL_TIMEOUT.as_secs());
            None
        }
    };
    if path.is_none() {
        eprintln!("[Rust] Using the inherited PATH without the login shell's");
    }
    path
}

fn path_between_sentinels(output: &str) -> Option<&str> {
    let after_start = &output[output.find(START)? + START.len()..];
    let path = after_start[..after_start.find(END)?].trim_matches(['\r', '\n']);
    (!path.is_empty()).then_some(path)
}

/// Joins PATH lists in priority order, then the extra directories. Each directory keeps its first
/// position. Empty entries are dropped: POSIX reads them as the current directory. None when the
/// result cannot be joined.
fn merge_paths<'a>(lists: impl IntoIterator<Item = Option<&'a OsStr>>, extra: &[PathBuf]) -> Option<OsString> {
    let mut merged: Vec<PathBuf> = Vec::new();
    let listed = lists.into_iter().flatten().flat_map(std::env::split_paths);
    for dir in listed.chain(extra.iter().cloned()) {
        if !dir.as_os_str().is_empty() && !merged.contains(&dir) {
            merged.push(dir);
        }
    }
    std::env::join_paths(merged).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn joined(dirs: &[&str]) -> OsString {
        std::env::join_paths(dirs).unwrap()
    }

    #[test]
    fn the_path_is_read_between_the_sentinels_whatever_the_rc_files_print() {
        let output = format!("Welcome!\n{START}\n/opt/homebrew/bin:/usr/bin\n{END}\nbye\n");
        assert_eq!(path_between_sentinels(&output), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(path_between_sentinels(&format!("{START}\r\n/usr/bin\r\n{END}")), Some("/usr/bin"));
    }

    #[test]
    fn missing_sentinels_or_an_empty_path_give_nothing() {
        assert_eq!(path_between_sentinels("/usr/bin\n"), None);
        assert_eq!(path_between_sentinels(&format!("{START}\n/usr/bin\n")), None);
        assert_eq!(path_between_sentinels(&format!("{START}\n\n{END}\n")), None);
        assert_eq!(path_between_sentinels(&format!("{END}\n/usr/bin\n{START}\n")), None);
    }

    #[test]
    fn the_shell_path_comes_first_and_each_directory_appears_once() {
        let shell = joined(&["/home/u/.nvm/versions/node/v22.11.0/bin", "/usr/bin"]);
        let inherited = joined(&["/usr/bin", "/bin"]);
        let fallbacks = [PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/bin")];
        let merged = merge_paths([Some(shell.as_os_str()), Some(inherited.as_os_str())], &fallbacks).unwrap();
        assert_eq!(merged, joined(&["/home/u/.nvm/versions/node/v22.11.0/bin", "/usr/bin", "/bin", "/opt/homebrew/bin"]));
    }

    #[test]
    fn a_missing_shell_path_keeps_the_inherited_one_and_drops_empty_entries() {
        let inherited = joined(&["/usr/bin", "", "/bin"]);
        let merged = merge_paths([None, Some(inherited.as_os_str())], &[PathBuf::from("/usr/local/bin")]).unwrap();
        assert_eq!(merged, joined(&["/usr/bin", "/bin", "/usr/local/bin"]));
    }
}
