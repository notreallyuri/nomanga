use crate::error::ServiceResult;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Device identity and sync bookkeeping. Deliberately not part of `Settings`:
/// settings travel inside a backup, and a device that adopted another's id
/// could no longer tell its own snapshots apart from a peer's.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SyncState {
    pub device_id: String,
    pub device_name: String,
    pub folder: Option<PathBuf>,
    pub last_push_at: Option<DateTime<Utc>>,
    pub last_pull_at: Option<DateTime<Utc>>,
    /// Shell command run after a push writes the folder, and before a pull
    /// reads it — the hook that carries the folder to and from a remote the
    /// filesystem cannot reach (Proton Drive, rclone, rsync).
    ///
    /// These live here rather than in `Settings` on purpose: settings travel
    /// inside a backup, so a command string there would let any imported
    /// backup file run arbitrary commands on the importing machine.
    pub post_push_command: Option<String>,
    pub pre_pull_command: Option<String>,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            device_id: uuid::Uuid::new_v4().to_string(),
            device_name: gethostname::gethostname().to_string_lossy().into_owned(),
            folder: None,
            last_push_at: None,
            last_pull_at: None,
            post_push_command: None,
            pre_pull_command: None,
        }
    }
}

pub fn load(path: &Path) -> ServiceResult<SyncState> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(SyncState::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn save(path: &Path, state: &SyncState) -> ServiceResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(state)?;
    let tmp = path.with_extension("json.tmp");

    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;

    Ok(())
}
