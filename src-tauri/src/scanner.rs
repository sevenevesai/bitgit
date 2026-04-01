use anyhow::Result;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct RepositoryScanner {
    directories: Vec<PathBuf>,
    max_depth: usize,
    exclude_patterns: Vec<String>,
}

impl RepositoryScanner {
    pub fn new(directories: Vec<PathBuf>, max_depth: usize, exclude_patterns: Vec<String>) -> Self {
        Self {
            directories,
            max_depth,
            exclude_patterns,
        }
    }

    pub fn scan(&self) -> Vec<PathBuf> {
        let mut repos = Vec::new();

        for dir in &self.directories {
            if !dir.exists() {
                eprintln!("Directory does not exist: {:?}", dir);
                continue;
            }

            let walker = WalkDir::new(dir)
                .max_depth(self.max_depth)
                .follow_links(false);

            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();

                // Check if directory contains .git
                if path.join(".git").exists() && path.is_dir() {
                    // Check against exclude patterns
                    if !self.is_excluded(path) {
                        repos.push(path.to_path_buf());
                    }
                }
            }
        }

        repos
    }

    fn is_excluded(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();
        self.exclude_patterns
            .iter()
            .any(|pattern| path_str.contains(pattern))
    }

    #[allow(dead_code)]
    pub fn get_repo_info(path: &Path) -> Result<RepositoryInfo> {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let git_dir = path.join(".git");
        if !git_dir.exists() {
            return Err(anyhow::anyhow!("Not a git repository"));
        }

        // Try to read remote URL from .git/config
        let config_path = git_dir.join("config");
        let remote_url = if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|content| Self::extract_remote_url(&content))
        } else {
            None
        };

        // Parse GitHub info from URL
        let (github_owner, github_repo) = if let Some(ref url) = remote_url {
            Self::parse_github_info(url)
        } else {
            (None, None)
        };

        Ok(RepositoryInfo {
            name,
            local_path: path.to_string_lossy().to_string(),
            github_url: remote_url,
            github_owner,
            github_repo,
        })
    }

    fn extract_remote_url(config_content: &str) -> Option<String> {
        // Simple parsing of git config to find origin URL
        for line in config_content.lines() {
            let line = line.trim();
            if line.starts_with("url = ") {
                return Some(line[6..].trim().to_string());
            }
        }
        None
    }

    fn parse_github_info(url: &str) -> (Option<String>, Option<String>) {
        // Parse GitHub URL to extract owner and repo
        // Supports both HTTPS and SSH formats:
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git

        let url = url.trim();

        if url.contains("github.com") {
            let parts: Vec<&str> = if url.starts_with("git@") {
                // SSH format: git@github.com:owner/repo.git
                if let Some(after_colon) = url.split(':').nth(1) {
                    after_colon.split('/').collect()
                } else {
                    return (None, None);
                }
            } else if url.starts_with("http") {
                // HTTPS format: https://github.com/owner/repo.git
                if let Some(after_domain) = url.split("github.com/").nth(1) {
                    after_domain.split('/').collect()
                } else {
                    return (None, None);
                }
            } else {
                return (None, None);
            };

            if parts.len() >= 2 {
                let owner = parts[0].to_string();
                let repo = parts[1].trim_end_matches(".git").to_string();
                return (Some(owner), Some(repo));
            }
        }

        (None, None)
    }
}

#[allow(dead_code)]
pub struct RepositoryInfo {
    pub name: String,
    pub local_path: String,
    pub github_url: Option<String>,
    pub github_owner: Option<String>,
    pub github_repo: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_info_https() {
        let url = "https://github.com/user/repo.git";
        let (owner, repo) = RepositoryScanner::parse_github_info(url);
        assert_eq!(owner, Some("user".to_string()));
        assert_eq!(repo, Some("repo".to_string()));
    }

    #[test]
    fn test_parse_github_info_ssh() {
        let url = "git@github.com:user/repo.git";
        let (owner, repo) = RepositoryScanner::parse_github_info(url);
        assert_eq!(owner, Some("user".to_string()));
        assert_eq!(repo, Some("repo".to_string()));
    }

    #[test]
    fn test_parse_github_info_no_git_extension() {
        let url = "https://github.com/user/repo";
        let (owner, repo) = RepositoryScanner::parse_github_info(url);
        assert_eq!(owner, Some("user".to_string()));
        assert_eq!(repo, Some("repo".to_string()));
    }
}
