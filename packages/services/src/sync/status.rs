use super::state::SyncState;
use crate::error::ServiceResult;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::Path;

pub const MANIFEST: &str = "latest.json";

#[derive(Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub device_id: String,
    pub device_name: String,
    pub created_at: DateTime<Utc>,
    pub app_version: String,
    pub file: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SyncStatus {
    pub folder: Option<String>,
    pub device_name: String,
    pub remote_device_name: Option<String>,
    pub remote_created_at: Option<String>,
    pub remote_is_this_device: bool,
    pub local_activity_at: Option<String>,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    /// True when this device has read or added something after the snapshot in
    /// the folder was taken — pulling would discard it.
    pub local_changes_since_remote: bool,
    pub post_push_command: Option<String>,
    pub pre_pull_command: Option<String>,
}

/// The most recent thing the user did on this device, across the tables a
/// backup carries. Used to warn before a pull throws local work away.
pub async fn local_activity_at(pool: &SqlitePool) -> ServiceResult<Option<DateTime<Utc>>> {
    let row = sqlx::query_scalar!(
        r#"SELECT MAX(ts) AS "ts: DateTime<Utc>" FROM (
               SELECT MAX(added_at)   AS ts FROM library_entry
               UNION ALL SELECT MAX(updated_at) FROM read_progress
               UNION ALL SELECT MAX(read_at)    FROM read_chapter
           )"#
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub fn read_manifest(folder: &Path) -> ServiceResult<Option<Manifest>> {
    match std::fs::read_to_string(folder.join(MANIFEST)) {
        Ok(text) => Ok(Some(serde_json::from_str(&text)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub async fn status(pool: &SqlitePool, state: &SyncState) -> ServiceResult<SyncStatus> {
    let manifest = match &state.folder {
        Some(folder) => read_manifest(folder)?,
        None => None,
    };

    let local_activity = local_activity_at(pool).await?;

    let local_changes_since_remote = match (&manifest, local_activity) {
        (Some(m), Some(local)) => local > m.created_at,
        // Nothing published yet, but this device has history worth pushing.
        (None, Some(_)) => true,
        _ => false,
    };

    Ok(SyncStatus {
        folder: state
            .folder
            .as_ref()
            .map(|f| f.to_string_lossy().into_owned()),
        device_name: state.device_name.clone(),
        remote_device_name: manifest.as_ref().map(|m| m.device_name.clone()),
        remote_created_at: manifest.as_ref().map(|m| m.created_at.to_rfc3339()),
        remote_is_this_device: manifest
            .as_ref()
            .is_some_and(|m| m.device_id == state.device_id),
        local_activity_at: local_activity.map(|t| t.to_rfc3339()),
        last_push_at: state.last_push_at.map(|t| t.to_rfc3339()),
        last_pull_at: state.last_pull_at.map(|t| t.to_rfc3339()),
        local_changes_since_remote,
        post_push_command: state.post_push_command.clone(),
        pre_pull_command: state.pre_pull_command.clone(),
    })
}
