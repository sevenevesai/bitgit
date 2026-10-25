use anyhow::{Context, Result};
use std::path::PathBuf;

// Debug smoke runs use isolated files and cannot access real stored credentials.
pub fn isolated_smoke() -> bool {
    cfg!(debug_assertions) && std::env::var_os("BITGIT_TEST_DATA_DIR").is_some()
}

pub fn config_dir() -> Result<PathBuf> {
    let directory = if isolated_smoke() {
        let path = PathBuf::from(std::env::var_os("BITGIT_TEST_DATA_DIR").unwrap());
        if !path.is_absolute() {
            anyhow::bail!("BITGIT_TEST_DATA_DIR must be an absolute isolated directory");
        }
        path
    } else {
        dirs::config_dir().context("Failed to get config directory")?.join("BitGit")
    };
    create_private_dir(&directory).context("Failed to create application data directory")?;
    Ok(directory)
}

// Vaults hold source, including untracked secrets. Windows APPDATA is already per-user; Unix would
// create the directory 0755.
fn create_private_dir(directory: &std::path::Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        std::fs::DirBuilder::new().recursive(true).mode(0o700).create(directory)
    }
    #[cfg(not(unix))]
    {
        std::fs::create_dir_all(directory)
    }
}
