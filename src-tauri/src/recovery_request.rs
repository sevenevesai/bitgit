//! Rust-boundary validation for recovery requests. The allow-list mirrors the
//! `RecoveryRequest` union in `git-service/src/recovery-types.ts`; extend both together.
//! Only the request's shape is checked here. Values (paths, ids, URLs, sizes) are
//! validated by the service, which owns the vault, destinations and receipts.

use serde_json::{Map, Value};
use std::path::{Component, Path};

#[derive(Clone, Copy)]
enum Kind {
    Text,
    TextList,
    Number,
    Settings,
}

struct Field {
    name: &'static str,
    kind: Kind,
    required: bool,
}

const fn req(name: &'static str, kind: Kind) -> Field {
    Field {
        name,
        kind,
        required: true,
    }
}

const fn opt(name: &'static str, kind: Kind) -> Field {
    Field {
        name,
        kind,
        required: false,
    }
}

// Keys of `RecoverySettings`; the service validates the values.
const SETTINGS_KEYS: [&str; 4] = ["automaticEnabled", "idleMinutes", "retention", "excludedPaths"];

// Actions that talk to a remote and may need the stored GitHub token.
const REMOTE_ACTIONS: [&str; 4] = ["backup", "verifyBackup", "remoteList", "remoteImport"];

// Every recognised action and its documented fields. Nothing else is forwarded, so a
// caller cannot pass a vault root or any other path-controlling field.
fn action_fields(action: &str) -> Option<Vec<Field>> {
    use Kind::*;
    Some(match action {
        "state" | "preview" | "autoTick" | "repairRollback" => vec![],
        "create" => vec![
            req("label", Text),
            opt("note", Text),
            opt("kind", Text),
            opt("expectedFingerprint", Text),
            opt("excludedPaths", TextList),
        ],
        "compare" | "verifyBackup" => vec![req("checkpointId", Text)],
        "recover" => vec![req("checkpointId", Text), req("destination", Text)],
        "repair" => vec![
            req("checkpointId", Text),
            req("paths", TextList),
            req("expectedFingerprint", Text),
        ],
        "backup" => vec![req("checkpointId", Text), req("remoteUrl", Text)],
        "remoteList" => vec![req("remoteUrl", Text)],
        "remoteImport" => vec![req("remoteUrl", Text), req("ref", Text)],
        "settings" => vec![req("settings", Settings)],
        "evidence" => vec![
            req("checkpointId", Text),
            req("description", Text),
            req("outcome", Text),
            opt("screenshotPath", Text),
        ],
        "runCheck" => vec![
            req("checkpointId", Text),
            req("command", Text),
            opt("timeoutSeconds", Number),
        ],
        "regressionStart" => vec![req("goodId", Text), req("badId", Text)],
        "regressionObserve" => vec![
            req("sessionId", Text),
            req("checkpointId", Text),
            req("outcome", Text),
        ],
        "regressionGet" => vec![req("sessionId", Text)],
        "evidenceImage" => vec![req("checkpointId", Text), req("evidenceId", Text)],
        _ => return None,
    })
}

fn kind_matches(kind: Kind, value: &Value) -> Result<(), &'static str> {
    match kind {
        Kind::Text if value.is_string() => Ok(()),
        Kind::Text => Err("a string"),
        Kind::TextList
            if value
                .as_array()
                .map_or(false, |items| items.iter().all(Value::is_string)) =>
        {
            Ok(())
        }
        Kind::TextList => Err("an array of strings"),
        Kind::Number if value.is_number() => Ok(()),
        Kind::Number => Err("a number"),
        Kind::Settings => match value.as_object() {
            Some(settings) => {
                if settings
                    .keys()
                    .any(|key| !SETTINGS_KEYS.contains(&key.as_str()))
                {
                    return Err(
                        "an object containing only automaticEnabled, idleMinutes, retention and excludedPaths",
                    );
                }
                if SETTINGS_KEYS[..3].iter().any(|key| !settings.contains_key(*key)) {
                    return Err("an object with automaticEnabled, idleMinutes and retention");
                }
                if settings.get("excludedPaths").map_or(false, |value| {
                    value.as_array().map_or(true, |items| items.iter().any(|item| !item.is_string()))
                }) {
                    return Err("an object whose excludedPaths is an array of strings");
                }
                Ok(())
            }
            None => Err("an object"),
        },
    }
}

fn short(text: &str) -> String {
    text.chars().take(48).collect()
}

/// A request that passed boundary validation and may be forwarded to the service.
#[derive(Debug)]
pub struct ValidatedRecovery {
    action: String,
    request: Value,
}

impl ValidatedRecovery {
    pub fn runs_check(&self) -> bool { self.action == "runCheck" }

    /// Whether the action may need the transient GitHub token. Local actions never do.
    pub fn needs_remote(&self) -> bool {
        REMOTE_ACTIONS.contains(&self.action.as_str())
    }

    pub fn into_request(self) -> Value {
        self.request
    }
}

/// Accept only a JSON object naming a recognised action, containing that action's
/// documented fields with the right JSON types. Anything else is rejected, not forwarded.
pub fn validate_recovery_request(request: Value) -> Result<ValidatedRecovery, String> {
    let Value::Object(object) = request else {
        return Err("Recovery request must be a JSON object".to_string());
    };

    let action = match object.get("action") {
        Some(Value::String(action)) => action.clone(),
        Some(_) => return Err("Recovery action must be a string".to_string()),
        None => return Err("Recovery request is missing an action".to_string()),
    };
    let fields = action_fields(&action)
        .ok_or_else(|| format!("Unknown recovery action '{}'", short(&action)))?;

    let mut clean = Map::new();
    clean.insert("action".to_string(), Value::String(action.clone()));

    for (key, value) in &object {
        if key == "action" {
            continue;
        }
        let field = fields
            .iter()
            .find(|field| field.name == key)
            .ok_or_else(|| {
                format!(
                    "Recovery action '{}' does not accept the field '{}'",
                    action,
                    short(key)
                )
            })?;
        // An explicit null means "not provided" for optional fields.
        if value.is_null() && !field.required {
            continue;
        }
        kind_matches(field.kind, value).map_err(|expected| {
            format!(
                "Field '{}' of recovery action '{}' must be {}",
                field.name, action, expected
            )
        })?;
        clean.insert(key.clone(), value.clone());
    }

    if let Some(missing) = fields
        .iter()
        .find(|field| field.required && !clean.contains_key(field.name))
    {
        return Err(format!(
            "Recovery action '{}' requires the field '{}'",
            action, missing.name
        ));
    }

    Ok(ValidatedRecovery {
        action,
        request: Value::Object(clean),
    })
}

/// Mask a secret in text bound for logs or the UI, in case the service echoed it.
pub fn redact_secret(text: &str, secret: &str) -> String {
    if secret.is_empty() {
        text.to_string()
    } else {
        text.replace(secret, "***")
    }
}

/// The source path forwarded to the service must be absolute and free of `..`. It need
/// not exist: checkpoints of a deleted or moved project stay listable and recoverable.
/// The path is passed unchanged - canonicalizing would add a `\\?\` prefix on Windows and
/// change the service's vault key for the same project.
pub fn validate_repo_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Project local path is empty".to_string());
    }
    if path.contains('\0') {
        return Err("Project local path contains an invalid character".to_string());
    }
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("Project local path must be absolute".to_string());
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Project local path must not contain '..'".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ok(request: Value) -> ValidatedRecovery {
        validate_recovery_request(request).expect("request should be accepted")
    }

    fn err(request: Value) -> String {
        validate_recovery_request(request).expect_err("request should be rejected")
    }

    #[test]
    fn accepts_every_documented_action() {
        let requests = vec![
            json!({"action": "state"}),
            json!({"action": "preview"}),
            json!({"action": "create", "label": "before refactor", "note": "n", "kind": "manual",
                   "expectedFingerprint": "abc", "excludedPaths": ["a.txt"]}),
            json!({"action": "compare", "checkpointId": "c1"}),
            json!({"action": "recover", "checkpointId": "c1", "destination": "D:/recovered"}),
            json!({"action": "repair", "checkpointId": "c1", "paths": ["src/a.rs"], "expectedFingerprint": "f"}),
            json!({"action": "repairRollback"}),
            json!({"action": "backup", "checkpointId": "c1", "remoteUrl": "https://github.com/o/r.git"}),
            json!({"action": "verifyBackup", "checkpointId": "c1"}),
            json!({"action": "remoteList", "remoteUrl": "https://github.com/o/r.git"}),
            json!({"action": "remoteImport", "remoteUrl": "https://github.com/o/r.git", "ref": "refs/heads/x"}),
            json!({"action": "settings", "settings": {"automaticEnabled": true, "idleMinutes": 10, "retention": "keep_all"}}),
            json!({"action": "autoTick"}),
            json!({"action": "evidence", "checkpointId": "c1", "description": "works", "outcome": "passed",
                   "screenshotPath": "C:/shots/a.png"}),
            json!({"action": "evidenceImage", "checkpointId": "c1", "evidenceId": "e1"}),
            json!({"action": "runCheck", "checkpointId": "c1", "command": "npm test", "timeoutSeconds": 60}),
            json!({"action": "regressionStart", "goodId": "a", "badId": "b"}),
            json!({"action": "regressionObserve", "sessionId": "s", "checkpointId": "c", "outcome": "good"}),
            json!({"action": "regressionGet", "sessionId": "s"}),
        ];
        assert_eq!(
            requests.len(),
            19,
            "one request per action in RecoveryRequest"
        );
        for request in requests {
            let expected = request.clone();
            assert_eq!(ok(request).into_request(), expected);
        }
    }

    #[test]
    fn rejects_non_objects_and_bad_actions() {
        assert!(err(json!("state")).contains("JSON object"));
        assert!(err(json!(["state"])).contains("JSON object"));
        assert!(err(json!(null)).contains("JSON object"));
        assert!(err(json!({})).contains("missing an action"));
        assert!(err(json!({"action": 5})).contains("must be a string"));
        assert!(err(json!({"action": "delete"})).contains("Unknown recovery action"));
        assert!(err(json!({"action": "State"})).contains("Unknown recovery action"));
    }

    #[test]
    fn caller_cannot_choose_the_vault_or_source_path() {
        for field in ["vaultRoot", "vault_root", "repoPath", "vaultPath", "root"] {
            let mut request = json!({"action": "state"});
            request[field] = json!("D:/somewhere");
            assert!(
                err(request).contains("does not accept"),
                "field {field} must be rejected"
            );
        }
        let with_root = json!({"action": "create", "label": "x", "vaultRoot": "D:/evil"});
        assert!(err(with_root).contains("vaultRoot"));
    }

    #[test]
    fn rejects_undocumented_fields_for_an_action() {
        // `destination` is documented for recover, not compare.
        let request = json!({"action": "compare", "checkpointId": "c", "destination": "D:/x"});
        assert!(err(request).contains("does not accept the field 'destination'"));
        let nested = json!({"action": "settings", "settings":
            {"automaticEnabled": true, "idleMinutes": 5, "retention": "keep_all", "vaultRoot": "D:/x"}});
        assert!(err(nested).contains("containing only"));
    }

    #[test]
    fn requires_documented_fields_and_checks_json_types() {
        assert!(err(json!({"action": "compare"})).contains("requires the field 'checkpointId'"));
        assert!(err(json!({"action": "recover", "checkpointId": "c"})).contains("'destination'"));
        assert!(err(json!({"action": "compare", "checkpointId": 7})).contains("must be a string"));
        assert!(err(json!({"action": "create", "label": {"a": 1}})).contains("must be a string"));
        assert!(err(json!({"action": "repair", "checkpointId": "c", "paths": "src/a.rs", "expectedFingerprint": "f"}))
            .contains("array of strings"));
        assert!(err(json!({"action": "repair", "checkpointId": "c", "paths": ["a", 3], "expectedFingerprint": "f"}))
            .contains("array of strings"));
        assert!(err(json!({"action": "runCheck", "checkpointId": "c", "command": "x", "timeoutSeconds": "60"}))
            .contains("must be a number"));
        assert!(
            err(json!({"action": "settings", "settings": {"automaticEnabled": true}}))
                .contains("automaticEnabled, idleMinutes and retention")
        );
        assert!(err(json!({"action": "settings", "settings": 3})).contains("an object"));
        assert!(
            err(json!({"action": "compare", "checkpointId": null})).contains("must be a string")
        );
    }

    #[test]
    fn null_optional_fields_are_dropped_not_forwarded() {
        let validated =
            ok(json!({"action": "create", "label": "x", "note": null, "excludedPaths": null}));
        assert_eq!(
            validated.into_request(),
            json!({"action": "create", "label": "x"})
        );
    }

    #[test]
    fn only_remote_actions_want_the_token() {
        for action in ["backup", "verifyBackup", "remoteList", "remoteImport"] {
            let request = match action {
                "backup" => json!({"action": action, "checkpointId": "c", "remoteUrl": "u"}),
                "verifyBackup" => json!({"action": action, "checkpointId": "c"}),
                "remoteList" => json!({"action": action, "remoteUrl": "u"}),
                _ => json!({"action": action, "remoteUrl": "u", "ref": "r"}),
            };
            assert!(ok(request).needs_remote(), "{action}");
        }
        for request in [
            json!({"action": "state"}),
            json!({"action": "create", "label": "x"}),
            json!({"action": "recover", "checkpointId": "c", "destination": "d"}),
            json!({"action": "runCheck", "checkpointId": "c", "command": "x"}),
        ] {
            assert!(!ok(request).needs_remote());
        }
    }

    #[test]
    fn secrets_are_masked_wherever_they_appear() {
        let token = "ghp_exampleexampleexample";
        let message =
            format!("fatal: unable to access 'https://{token}@github.com/o/r.git' with {token}");
        let redacted = redact_secret(&message, token);
        assert!(!redacted.contains(token));
        assert_eq!(redacted.matches("***").count(), 2);
        assert_eq!(redact_secret("nothing here", token), "nothing here");
        assert_eq!(redact_secret("unchanged", ""), "unchanged");
    }

    #[test]
    fn very_long_unknown_names_are_not_echoed_in_full() {
        let long = "x".repeat(500);
        let message = err(json!({ "action": long }));
        assert!(message.len() < 120, "message was {} bytes", message.len());
    }

    #[cfg(windows)]
    #[test]
    fn repo_path_must_be_absolute_and_traversal_free_on_windows() {
        assert!(validate_repo_path("C:\\Users\\dev\\app").is_ok());
        assert!(validate_repo_path("C:/Users/dev/app").is_ok());
        assert!(validate_repo_path("\\\\server\\share\\app").is_ok());
        assert!(validate_repo_path("app").is_err());
        assert!(validate_repo_path("\\app").is_err());
        assert!(validate_repo_path("C:app").is_err());
        assert!(validate_repo_path("C:\\Users\\dev\\..\\other").is_err());
    }

    #[cfg(not(windows))]
    #[test]
    fn repo_path_must_be_absolute_and_traversal_free() {
        assert!(validate_repo_path("/home/dev/app").is_ok());
        assert!(validate_repo_path("app").is_err());
        assert!(validate_repo_path("/home/dev/../other").is_err());
    }

    #[test]
    fn repo_path_rejects_empty_and_nul() {
        assert!(validate_repo_path("").is_err());
        assert!(validate_repo_path("   ").is_err());
        assert!(validate_repo_path("C:/a\0b").is_err());
    }

    #[test]
    fn repo_path_need_not_exist() {
        // A deleted source must stay recoverable.
        let missing = if cfg!(windows) {
            "C:/definitely/not/here/project"
        } else {
            "/definitely/not/here/project"
        };
        assert!(validate_repo_path(missing).is_ok());
    }
}
