use nomanga_services::backup::ImportReport;
use nomanga_services::settings;
use nomanga_services::sync::{self, SyncStatus};
use std::path::PathBuf;
use tauri::State;

use crate::commands::backup::installed;
use crate::{error::CommandResult, AppState};

#[tauri::command]
#[specta::specta]
pub async fn sync_status(state: State<'_, AppState>) -> CommandResult<SyncStatus> {
    let current = state.sync.read()?.clone();
    let res = sync::status(&state.pool, &current).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn set_sync_folder(
    state: State<'_, AppState>,
    path: Option<String>,
) -> CommandResult<()> {
    let mut guard = state.sync.write()?;
    guard.folder = path.map(PathBuf::from);
    sync::save(&state.sync_path, &guard)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn sync_push(state: State<'_, AppState>) -> CommandResult<SyncStatus> {
    let extensions = installed(&state)?;
    let current = state.settings.read()?.clone();

    // Cloned out, mutated, then written back: the push is async and the guard
    // is not Send.
    let mut sync_state = state.sync.read()?.clone();
    sync::push(
        &state.pool,
        &current,
        &mut sync_state,
        env!("CARGO_PKG_VERSION"),
        extensions,
    )
    .await?;

    sync::save(&state.sync_path, &sync_state)?;
    *state.sync.write()? = sync_state.clone();

    let res = sync::status(&state.pool, &sync_state).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn sync_pull(state: State<'_, AppState>) -> CommandResult<ImportReport> {
    let ids = installed(&state)?
        .into_iter()
        .map(|e| e.id)
        .collect::<Vec<_>>();

    let mut sync_state = state.sync.read()?.clone();
    let (snapshot, report) = sync::pull(&state.pool, &mut sync_state, &ids).await?;

    sync::save(&state.sync_path, &sync_state)?;
    *state.sync.write()? = sync_state;

    settings::save(&state.settings_path, &snapshot.settings)?;
    *state.settings.write()? = snapshot.settings;

    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub async fn set_sync_hooks(
    state: State<'_, AppState>,
    post_push: Option<String>,
    pre_pull: Option<String>,
) -> CommandResult<()> {
    let mut guard = state.sync.write()?;
    guard.post_push_command = post_push.filter(|c| !c.trim().is_empty());
    guard.pre_pull_command = pre_pull.filter(|c| !c.trim().is_empty());
    sync::save(&state.sync_path, &guard)?;

    Ok(())
}
