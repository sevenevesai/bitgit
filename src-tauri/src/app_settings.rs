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
    /// Launches of the app, counted once per start.
    #[serde(default)]
    pub launch_count: u32,
    /// Set the moment the community nudge is displayed; it never returns afterwards.
    #[serde(default)]
    pub community_nudge_seen: bool,
}

/// Launch from which the community nudge is eligible without a first successful sync.
const NUDGE_LAUNCH: u32 = 3;

/// Whether the one-time community nudge may be shown now. Never on the first launch; from the
/// third launch, or after a successful sync on a later launch; never twice, never while busy.
pub fn should_show_nudge(launch_count: u32, seen: bool, busy: bool, synced_this_launch: bool) -> bool {
    if seen || busy || launch_count < 2 {
        return false;
    }
    launch_count >= NUDGE_LAUNCH || synced_this_launch
}

/// Load settings, failing when an existing file cannot be read or parsed. `load_settings` falls
/// back to defaults there, and a launch write on top of that would overwrite the user's file.
fn load_settings_strict() -> Result<AppSettings> {
    let path = get_settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let json = fs::read_to_string(&path).context("Failed to read settings file")?;
    serde_json::from_str(&json).context("Failed to parse settings file")
}

/// Count this launch and return the new total.
pub fn record_launch() -> Result<u32> {
    let mut settings = load_settings_strict()?;
    settings.launch_count = settings.launch_count.saturating_add(1);
    save_settings(&settings)?;
    Ok(settings.launch_count)
}

/// Decide whether to show the nudge and, when yes, persist "seen" before answering. Any failure
/// to read or write settings answers no.
pub fn claim_nudge(busy: bool, synced_this_launch: bool) -> bool {
    let attempt = || -> Result<bool> {
        let mut settings = load_settings_strict()?;
        if !should_show_nudge(settings.launch_count, settings.community_nudge_seen, busy, synced_this_launch) {
            return Ok(false);
        }
        settings.community_nudge_seen = true;
        save_settings(&settings)?;
        Ok(true)
    };
    match attempt() {
        Ok(show) => show,
        Err(e) => {
            eprintln!("[AppSettings] Community nudge skipped: {:#}", e);
            false
        }
    }
}

/// Get the path to the settings file
fn get_settings_path() -> Result<PathBuf> {
    let config_dir = crate::app_data::config_dir()?;

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

    #[test]
    fn nudge_never_on_first_or_second_launch() {
        assert!(!should_show_nudge(1, false, false, false));
        assert!(!should_show_nudge(1, false, false, true));
        assert!(!should_show_nudge(2, false, false, false));
    }

    #[test]
    fn nudge_shown_on_third_launch() {
        assert!(should_show_nudge(3, false, false, false));
        assert!(should_show_nudge(10, false, false, false));
    }

    #[test]
    fn nudge_shown_after_sync_on_later_launch() {
        assert!(should_show_nudge(2, false, false, true));
    }

    #[test]
    fn nudge_suppressed_while_busy() {
        assert!(!should_show_nudge(3, false, true, false));
        assert!(!should_show_nudge(2, false, true, true));
    }

    #[test]
    fn nudge_not_shown_again_once_seen_including_round_trip() {
        assert!(!should_show_nudge(5, true, false, true));

        let mut settings = AppSettings { launch_count: 3, ..AppSettings::default() };
        assert!(should_show_nudge(settings.launch_count, settings.community_nudge_seen, false, false));
        settings.community_nudge_seen = true;
        let json = serde_json::to_string_pretty(&settings).unwrap();
        let loaded: AppSettings = serde_json::from_str(&json).unwrap();
        assert!(loaded.community_nudge_seen);
        assert!(!should_show_nudge(loaded.launch_count, loaded.community_nudge_seen, false, false));
    }

    #[test]
    fn settings_from_current_release_load_with_defaults() {
        let json = r#"{"editor":{"preset":"cursor"}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.editor.preset, EditorPreset::Cursor);
        assert_eq!(settings.launch_count, 0);
        assert!(!settings.community_nudge_seen);
        let empty: AppSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(empty.launch_count, 0);
    }
}
