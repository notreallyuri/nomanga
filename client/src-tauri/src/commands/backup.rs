use nomanga_services::backup::{self, ExtensionRef, ImportMode, ImportReport};
use nomanga_services::settings;
use std::path::PathBuf;
use tauri::State;

use crate::{error::CommandResult, AppState};

pub fn installed(state: &AppState) -> CommandResult<Vec<ExtensionRef>> {
    let registry = state.registry.read()?;

    Ok(registry
        .extensions()
        .iter()
        .map(|info| ExtensionRef {
            id: info.id.clone(),
            version: info.version.clone(),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn export_backup(state: State<'_, AppState>, path: String) -> CommandResult<()> {
    let extensions = installed(&state)?;
    let current = state.settings.read()?.clone();

    let backup =
        backup::export(&state.pool, &current, env!("CARGO_PKG_VERSION"), extensions).await?;

    backup::write_file(&PathBuf::from(path), &backup)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn import_backup(
    state: State<'_, AppState>,
    path: String,
    mode: ImportMode,
) -> CommandResult<ImportReport> {
    let restored = backup::read_file(&PathBuf::from(path))?;
    let ids = installed(&state)?
        .into_iter()
        .map(|e| e.id)
        .collect::<Vec<_>>();

    let report = backup::import(&state.pool, &restored, mode, &ids).await?;

    settings::save(&state.settings_path, &restored.settings)?;
    *state.settings.write()? = restored.settings;

    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub async fn restart_app(app: tauri::AppHandle) {
    app.restart()
}
