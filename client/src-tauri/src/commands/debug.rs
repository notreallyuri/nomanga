use nomanga_services::cache::image::{self, ImageCacheStats};
use nomanga_services::debug::{self, TableCount, TablePage};
use nomanga_services::settings::Settings;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{error::CommandResult, AppState};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DebugPath {
    pub name: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DebugExtension {
    pub id: String,
    pub version: String,
    pub abi_version: u32,
    pub sources: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct DebugState {
    pub app_version: String,
    pub abi_version: u32,
    pub device_name: String,
    pub paths: Vec<DebugPath>,
    pub extensions: Vec<DebugExtension>,
    pub image_cache: ImageCacheStats,
    pub tables: Vec<TableCount>,
    pub settings: Settings,
}

fn path_entry(name: &str, path: &std::path::Path) -> DebugPath {
    DebugPath {
        name: name.to_owned(),
        path: path.to_string_lossy().into_owned(),
        exists: path.exists(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn debug_state(state: State<'_, AppState>) -> CommandResult<DebugState> {
    let extensions = {
        let registry = state.registry.read()?;
        registry
            .extensions()
            .iter()
            .map(|info| DebugExtension {
                id: info.id.clone(),
                version: info.version.clone(),
                abi_version: info.abi_version,
                sources: registry
                    .sources_of(&info.id)
                    .into_iter()
                    .map(|s| s.id)
                    .collect(),
            })
            .collect()
    };

    // Every guard is released before the first await; holding one across one
    // would make this future non-Send and the command would not compile.
    let (paths, device_name) = {
        let sync = state.sync.read()?;
        let paths = vec![
            path_entry("Settings", &state.settings_path),
            path_entry("Sync state", &state.sync_path),
            path_entry("Downloads", &state.downloads_dir),
            path_entry("Cover cache", &state.image_cache_dir),
            path_entry(
                "Sync folder",
                sync.folder.as_deref().unwrap_or(std::path::Path::new("")),
            ),
        ];
        (paths, sync.device_name.clone())
    };

    let settings = state.settings.read()?.clone();

    let image_cache = image::stats(&state.pool).await?;
    let tables = debug::table_counts(&state.pool).await?;

    Ok(DebugState {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        abi_version: nomanga_core::extension::source::ABI_VERSION,
        device_name,
        paths,
        extensions,
        image_cache,
        tables,
        settings,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn debug_table(
    state: State<'_, AppState>,
    name: String,
    page: u32,
) -> CommandResult<TablePage> {
    let res = debug::table_page(&state.pool, &name, page).await?;

    Ok(res)
}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct CallEntry {
    pub source_id: String,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub error: Option<String>,
    pub duration_ms: f64,
    pub at: String,
    pub request_headers: Vec<(String, String)>,
    pub response_headers: Vec<(String, String)>,
    pub body: String,
    pub body_bytes: f64,
    pub truncated: bool,
}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct CallLogState {
    pub recording: bool,
    pub entries: Vec<CallEntry>,
}

#[tauri::command]
#[specta::specta]
pub async fn call_log(state: State<'_, AppState>) -> CommandResult<CallLogState> {
    let entries = state
        .transport
        .log
        .snapshot()
        .into_iter()
        .map(|r| CallEntry {
            source_id: r.source_id,
            method: r.method,
            url: r.url,
            status: r.status,
            error: r.error,
            duration_ms: r.duration_ms as f64,
            at: r.at.to_rfc3339(),
            request_headers: r.request_headers,
            response_headers: r.response_headers,
            truncated: r.body.len() < r.body_bytes,
            body_bytes: r.body_bytes as f64,
            // Page images and other binary payloads would be noise as text.
            body: match std::str::from_utf8(&r.body) {
                Ok(text) => text.to_owned(),
                Err(_) => format!("<{} bytes of binary>", r.body.len()),
            },
        })
        .collect();

    Ok(CallLogState {
        recording: state
            .transport
            .recording
            .load(std::sync::atomic::Ordering::Relaxed),
        entries,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn set_call_recording(state: State<'_, AppState>, on: bool) -> CommandResult<()> {
    crate::transport::set_recording(&state.transport, on);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn clear_call_log(state: State<'_, AppState>) -> CommandResult<()> {
    state.transport.log.clear();

    Ok(())
}

/// Headers stripped from an exported log. These carry credentials and are
/// almost never the thing being debugged, whereas an export is written to be
/// pasted into an issue tracker.
const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "x-auth-token",
];

/// Column values redacted when exporting `source_setting`, which is where an
/// extension's declared secrets are persisted.
const SENSITIVE_KEY_HINTS: &[&str] = &["key", "token", "secret", "password", "auth", "session"];

const REDACTED: &str = "<redacted>";

fn redact_headers(headers: Vec<(String, String)>) -> Vec<(String, String)> {
    headers
        .into_iter()
        .map(|(key, value)| {
            let sensitive = SENSITIVE_HEADERS
                .iter()
                .any(|h| key.eq_ignore_ascii_case(h));
            if sensitive {
                (key, REDACTED.to_owned())
            } else {
                (key, value)
            }
        })
        .collect()
}

fn looks_secret(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    SENSITIVE_KEY_HINTS.iter().any(|hint| key.contains(hint))
}

fn write_export(path: &str, value: &serde_json::Value) -> CommandResult<()> {
    let json =
        serde_json::to_string_pretty(value).map_err(|e| crate::error::CommandError::Internal {
            message: format!("could not encode export: {e}"),
        })?;

    std::fs::write(path, json).map_err(|e| crate::error::CommandError::Internal {
        message: format!("could not write {path}: {e}"),
    })?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn export_call_log(state: State<'_, AppState>, path: String) -> CommandResult<()> {
    let entries: Vec<serde_json::Value> = state
        .transport
        .log
        .snapshot()
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "at": r.at.to_rfc3339(),
                "source_id": r.source_id,
                "method": r.method,
                "url": r.url,
                "status": r.status,
                "error": r.error,
                "duration_ms": r.duration_ms,
                "request_headers": redact_headers(r.request_headers),
                "response_headers": redact_headers(r.response_headers),
                "body_bytes": r.body_bytes,
                "body_truncated": r.body.len() < r.body_bytes,
                "body": String::from_utf8(r.body.clone())
                    .unwrap_or_else(|_| format!("<{} bytes of binary>", r.body.len())),
            })
        })
        .collect();

    write_export(
        &path,
        &serde_json::json!({
            "kind": "nomanga.call-log",
            "app_version": env!("CARGO_PKG_VERSION"),
            "abi_version": nomanga_core::extension::source::ABI_VERSION,
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "note": "Credential-bearing headers were replaced with <redacted> before export.",
            "entries": entries,
        }),
    )
}

#[tauri::command]
#[specta::specta]
pub async fn export_table_rows(
    _state: State<'_, AppState>,
    path: String,
    table: String,
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
) -> CommandResult<()> {
    let key_at = columns.iter().position(|c| c == "key");
    let value_at = columns.iter().position(|c| c == "value");
    let mut redacted_any = false;

    let objects: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            let mut object = serde_json::Map::new();
            for (i, column) in columns.iter().enumerate() {
                let cell = row.get(i).cloned().flatten();

                // source_setting is where extensions persist their declared
                // secrets; the key names the setting, the value is the secret.
                let hide = Some(i) == value_at
                    && key_at
                        .and_then(|k| row.get(k).cloned().flatten())
                        .is_some_and(|key| looks_secret(&key));

                if hide {
                    redacted_any = true;
                    object.insert(
                        column.clone(),
                        serde_json::Value::String(REDACTED.to_owned()),
                    );
                } else {
                    object.insert(
                        column.clone(),
                        cell.map(serde_json::Value::String)
                            .unwrap_or(serde_json::Value::Null),
                    );
                }
            }
            serde_json::Value::Object(object)
        })
        .collect();

    write_export(
        &path,
        &serde_json::json!({
            "kind": "nomanga.table-rows",
            "app_version": env!("CARGO_PKG_VERSION"),
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "table": table,
            "row_count": objects.len(),
            "note": if redacted_any {
                "Values for secret-looking settings were replaced with <redacted>."
            } else {
                "No redactions were applied."
            },
            "rows": objects,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_credential_headers_case_insensitively() {
        let headers = redact_headers(vec![
            ("Authorization".into(), "Bearer secret-token".into()),
            ("COOKIE".into(), "cf_clearance=abc".into()),
            ("User-Agent".into(), "Firefox".into()),
            ("Referer".into(), "https://example.com".into()),
        ]);

        assert_eq!(headers[0].1, REDACTED);
        assert_eq!(headers[1].1, REDACTED);
        assert_eq!(headers[2].1, "Firefox", "diagnostic headers must survive");
        assert_eq!(headers[3].1, "https://example.com");
    }

    #[test]
    fn spots_secret_setting_keys() {
        for key in ["api_key", "session_token", "API_KEY", "user_password"] {
            assert!(looks_secret(key), "{key} should be redacted");
        }
        for key in ["language", "quality", "data_saver"] {
            assert!(!looks_secret(key), "{key} is not a secret");
        }
    }
}
