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
    std::fs::create_dir_all(&directory).context("Failed to create application data directory")?;
    Ok(directory)
}
