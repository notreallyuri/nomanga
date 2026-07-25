use nomanga_services::settings::{
    self,
    reader::{self, ReaderOverride, ReaderSettings, SOURCE_SCOPE},
    Settings,
};
use tauri::State;

use crate::{error::CommandResult, AppState};

#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: State<'_, AppState>) -> CommandResult<Settings> {
    let guard = state.settings.read()?;

    Ok(guard.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings(
    state: State<'_, AppState>,
    new_settings: Settings,
) -> CommandResult<()> {
    settings::save(&state.settings_path, &new_settings)?;

    let mut guard = state.settings.write()?;
    *guard = new_settings;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn effective_reader_settings(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<ReaderSettings> {
    let global = state.settings.read()?.reader.clone();
    let res = reader::effective(&global, &state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn get_source_reader_override(
    state: State<'_, AppState>,
    source_id: String,
) -> CommandResult<ReaderOverride> {
    let res = reader::get_override(&state.pool, &source_id, SOURCE_SCOPE).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn set_source_reader_override(
    state: State<'_, AppState>,
    source_id: String,
    over: ReaderOverride,
) -> CommandResult<()> {
    reader::set_override(&state.pool, &source_id, SOURCE_SCOPE, &over).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_manga_reader_override(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<ReaderOverride> {
    let res = reader::get_override(&state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn set_manga_reader_override(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    over: ReaderOverride,
) -> CommandResult<()> {
    reader::set_override(&state.pool, &source_id, &manga_id, &over).await?;

    Ok(())
}
