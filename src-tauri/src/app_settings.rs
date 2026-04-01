use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Editor preset identifiers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EditorPreset {
    Vscode,
    Cursor,
    Sublime,
    Custom,
}

impl Default for EditorPreset {
    fn default() -> Self {
        Self::Vscode
    }
}

/// Editor configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorConfig {
    pub preset: EditorPreset,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_command: Option<String>,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            preset: EditorPreset::default(),
            custom_command: None,
        }
    }
}

/// Application settings that persist between sessions
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub editor: EditorConfig,
    // Future settings can be added here
}

/// Get the path to the settings file
fn get_settings_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Failed to get config directory")?
        .join("BitGit");

    // Ensure directory exists
    fs::create_dir_all(&config_dir).context("Failed to create config directory")?;

    Ok(config_dir.join("settings.json"))
}

/// Get the temp file path for atomic writes
fn get_temp_path() -> Result<PathBuf> {
    let settings_path = get_settings_path()?;
    Ok(settings_path.with_extension("json.tmp"))
}

/// Load settings from disk, returning defaults if file doesn't exist or is invalid
pub fn load_settings() -> Result<AppSettings> {
    let path = get_settings_path()?;

    if !path.exists() {
        eprintln!("[AppSettings] No settings file found, using defaults");
        return Ok(AppSettings::default());
    }

    match fs::read_to_string(&path) {
        Ok(json) => {
            match serde_json::from_str::<AppSettings>(&json) {
                Ok(settings) => {
                    eprintln!("[AppSettings] Loaded settings from {:?}", path);
                    Ok(settings)
                }
                Err(e) => {
                    eprintln!(
                        "[AppSettings] Failed to parse settings ({}), using defaults",
                        e
                    );
                    Ok(AppSettings::default())
                }
            }
        }
        Err(e) => {
            eprintln!(
                "[AppSettings] Failed to read settings file ({}), using defaults",
                e
            );
            Ok(AppSettings::default())
        }
    }
}

/// Save settings to disk using atomic write
pub fn save_settings(settings: &AppSettings) -> Result<()> {
    let settings_path = get_settings_path()?;
    let temp_path = get_temp_path()?;

    // Serialize to JSON
    let json =
        serde_json::to_string_pretty(settings).context("Failed to serialize settings")?;

    // Write to temp file first
    fs::write(&temp_path, &json).context("Failed to write temp settings file")?;

    // Remove old settings file if it exists (required on Windows for rename)
    if settings_path.exists() {
        fs::remove_file(&settings_path).context("Failed to remove old settings file")?;
    }

    // Atomic rename temp -> main
    fs::rename(&temp_path, &settings_path).context("Failed to rename temp settings file")?;

    eprintln!("[AppSettings] Saved settings to {:?}", settings_path);
    Ok(())
}

/// Update just the editor configuration
pub fn save_editor_config(preset: EditorPreset, custom_command: Option<String>) -> Result<()> {
    let mut settings = load_settings()?;
    settings.editor.preset = preset;
    settings.editor.custom_command = custom_command;
    save_settings(&settings)
}

/// Get the editor configuration
pub fn get_editor_config() -> Result<EditorConfig> {
    let settings = load_settings()?;
    Ok(settings.editor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.editor.preset, EditorPreset::Vscode);
        assert!(settings.editor.custom_command.is_none());
    }

    #[test]
    fn test_editor_preset_serialization() {
        let config = EditorConfig {
            preset: EditorPreset::Custom,
            custom_command: Some("nvim".to_string()),
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"preset\":\"custom\""));
        assert!(json.contains("\"customCommand\":\"nvim\""));
    }
}
