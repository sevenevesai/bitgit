use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use windows::Security::Credentials::{PasswordCredential, PasswordVault};

const CREDENTIAL_RESOURCE: &str = "BitGit_GitHub_Token";
#[cfg(not(target_os = "windows"))]
const KEYRING_SERVICE: &str = "bitgit";

fn get_config_dir() -> Result<PathBuf> {
    let config_dir = crate::app_data::config_dir()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }

    Ok(config_dir)
}

fn get_username_file() -> Result<PathBuf> {
    Ok(get_config_dir()?.join("github_username.txt"))
}

pub struct CredentialManager {
    #[cfg(target_os = "windows")]
    vault: PasswordVault,
}

impl CredentialManager {
    pub fn new() -> Result<Self> {
        #[cfg(target_os = "windows")]
        {
            let vault = PasswordVault::new()
                .context("Failed to access Windows Credential Manager")?;
            Ok(Self { vault })
        }

        #[cfg(not(target_os = "windows"))]
        {
            Ok(Self {})
        }
    }

    pub fn save_token(&self, username: &str, token: &str) -> Result<()> {
        if crate::app_data::isolated_smoke() {
            anyhow::bail!("Credential writes are disabled in isolated smoke runs");
        }
        // Validate token format
        if !token.starts_with("ghp_") && !token.starts_with("github_pat_") {
            return Err(anyhow::anyhow!("Invalid GitHub token format"));
        }

        #[cfg(target_os = "windows")]
        {
            use windows::core::HSTRING;

            let resource = HSTRING::from(CREDENTIAL_RESOURCE);
            let user = HSTRING::from(username);
            let pass = HSTRING::from(token);

            // Try to retrieve existing credential first
            if let Ok(existing) = self.vault.Retrieve(&resource, &user) {
                // Remove old credential
                let _ = self.vault.Remove(&existing);
            }

            // Create new credential
            let credential = PasswordCredential::CreatePasswordCredential(
                &resource,
                &user,
                &pass,
            )
            .context("Failed to create credential")?;

            self.vault.Add(&credential)
                .context("Failed to add credential to vault")?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            let entry = keyring::Entry::new(KEYRING_SERVICE, username)
                .context("Failed to create keyring entry")?;
            entry.set_password(token)
                .context("Failed to save token to keyring")?;
        }

        // Save username to file for later retrieval
        let username_file = get_username_file()?;
        fs::write(username_file, username)
            .context("Failed to save username to config")?;

        Ok(())
    }

    pub fn get_token(&self, username: &str) -> Result<String> {
        if crate::app_data::isolated_smoke() {
            anyhow::bail!("Stored credentials are unavailable in isolated smoke runs");
        }
        #[cfg(target_os = "windows")]
        {
            use windows::core::HSTRING;

            let resource = HSTRING::from(CREDENTIAL_RESOURCE);
            let user = HSTRING::from(username);

            let credential = self.vault.Retrieve(&resource, &user)
                .context("Failed to retrieve credential")?;

            credential.RetrievePassword()
                .context("Failed to retrieve password")?;

            let password = credential.Password()
                .context("Failed to get password")?;

            Ok(password.to_string())
        }

        #[cfg(not(target_os = "windows"))]
        {
            let entry = keyring::Entry::new(KEYRING_SERVICE, username)
                .context("Failed to create keyring entry")?;
            entry.get_password()
                .context("Failed to retrieve token from keyring")
        }
    }

    #[allow(dead_code)]
    pub fn delete_token(&self, username: &str) -> Result<()> {
        if crate::app_data::isolated_smoke() {
            anyhow::bail!("Credential writes are disabled in isolated smoke runs");
        }
        #[cfg(target_os = "windows")]
        {
            use windows::core::HSTRING;

            let resource = HSTRING::from(CREDENTIAL_RESOURCE);
            let user = HSTRING::from(username);

            let credential = self.vault.Retrieve(&resource, &user)
                .context("Failed to retrieve credential")?;

            self.vault.Remove(&credential)
                .context("Failed to remove credential")?;

            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            let entry = keyring::Entry::new(KEYRING_SERVICE, username)
                .context("Failed to create keyring entry")?;
            entry.delete_password()
                .context("Failed to delete token from keyring")
        }
    }

    pub fn has_token(&self, username: &str) -> bool {
        if crate::app_data::isolated_smoke() { return false; }
        #[cfg(target_os = "windows")]
        {
            use windows::core::HSTRING;

            let resource = HSTRING::from(CREDENTIAL_RESOURCE);
            let user = HSTRING::from(username);

            self.vault.Retrieve(&resource, &user).is_ok()
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, username) {
                entry.get_password().is_ok()
            } else {
                false
            }
        }
    }

    /// Get the first stored GitHub credential (username + token)
    pub fn get_stored_credential(&self) -> Result<Option<(String, String)>> {
        // Read username from config file
        let username_file = get_username_file()?;

        if !username_file.exists() {
            return Ok(None);
        }

        let username = fs::read_to_string(username_file)
            .context("Failed to read username from config")?
            .trim()
            .to_string();

        if username.is_empty() {
            return Ok(None);
        }

        // Try to get token from credential manager
        match self.get_token(&username) {
            Ok(token) => Ok(Some((username, token))),
            Err(_) => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn invalid_token_is_rejected_before_credential_storage() {
        let manager = CredentialManager::new().unwrap();
        let result = manager.save_token("bitgit-invalid-format-test", "invalid-token");
        assert!(result.is_err());
        // No real credential or username file is created, overwritten, read or deleted.
    }
}
