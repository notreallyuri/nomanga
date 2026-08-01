use super::hook::{non_empty, run_hook};
use super::state::SyncState;
use super::status::{Manifest, MANIFEST, read_manifest};
use crate::backup::{self, Backup, ExtensionRef, ImportMode, ImportReport};
use crate::error::{ServiceError, ServiceResult};
use crate::now;
use crate::settings::Settings;
use sqlx::SqlitePool;
use std::path::Path;

pub(super) const KEEP_PER_DEVICE: usize = 5;

pub async fn push(
    pool: &SqlitePool,
    settings: &Settings,
    state: &mut SyncState,
    app_version: &str,
    extensions: Vec<ExtensionRef>,
) -> ServiceResult<Manifest> {
    let folder = state.folder.clone().ok_or(ServiceError::SyncNotConfigured)?;
    std::fs::create_dir_all(&folder)?;

    let snapshot = backup::export(pool, settings, app_version, extensions).await?;

    let created_at = snapshot.created_at;
    let file = format!(
        "nomanga-{}-{}.backup",
        safe(&state.device_name),
        created_at.format("%Y%m%dT%H%M%SZ")
    );

    backup::write_file(&folder.join(&file), &snapshot)?;

    let manifest = Manifest {
        device_id: state.device_id.clone(),
        device_name: state.device_name.clone(),
        created_at,
        app_version: app_version.to_owned(),
        file,
    };

    let json = serde_json::to_string_pretty(&manifest)?;
    let tmp = folder.join("latest.json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, folder.join(MANIFEST))?;

    prune(&folder, &state.device_name);

    // Upload last, and only record the push if it succeeded: a snapshot that
    // never reached the remote is not a push, and marking it as one would make
    // the other device's "you have newer local work" warning lie.
    if let Some(command) = non_empty(&state.post_push_command) {
        run_hook("post-push", command, &folder).await?;
    }

    state.last_push_at = Some(created_at);

    Ok(manifest)
}

pub async fn pull(
    pool: &SqlitePool,
    state: &mut SyncState,
    installed_extensions: &[String],
) -> ServiceResult<(Backup, ImportReport)> {
    let folder = state.folder.clone().ok_or(ServiceError::SyncNotConfigured)?;

    // Download first, and abort on failure before the import touches the
    // database — otherwise a failed fetch would replace the library with a
    // stale snapshot, or none at all.
    if let Some(command) = non_empty(&state.pre_pull_command) {
        std::fs::create_dir_all(&folder)?;
        run_hook("pre-pull", command, &folder).await?;
    }

    let manifest = read_manifest(&folder)?.ok_or(ServiceError::SyncNoSnapshot)?;
    let snapshot = backup::read_file(&folder.join(&manifest.file))?;

    // Replace, not merge: a pull means "make this device match the snapshot".
    // Merging is what push/pull exists to avoid needing.
    let report = backup::import(pool, &snapshot, ImportMode::Replace, installed_extensions).await?;

    state.last_pull_at = Some(now());

    Ok((snapshot, report))
}

pub(super) fn safe(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_owned();
    if trimmed.is_empty() {
        "device".to_owned()
    } else {
        trimmed
    }
}

fn prune(folder: &Path, device_name: &str) {
    let prefix = format!("nomanga-{}-", safe(device_name));

    let Ok(entries) = std::fs::read_dir(folder) else {
        return;
    };

    let mut mine: Vec<_> = entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(&prefix) && name.ends_with(".backup"))
        .collect();

    // The timestamp is fixed-width, so lexical order is chronological.
    mine.sort();

    let excess = mine.len().saturating_sub(KEEP_PER_DEVICE);
    for name in &mine[..excess] {
        std::fs::remove_file(folder.join(name)).ok();
    }
}
