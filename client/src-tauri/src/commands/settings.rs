use nomanga_services::settings::{self, Settings};
use tauri::State;

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let guard = state.settings.read().map_err(|_| "settings poisoned")?;
    Ok(guard.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings(
    state: State<'_, AppState>,
    new_settings: Settings,
) -> Result<(), String> {
    settings::save(&state.settings_path, &new_settings).map_err(|e| e.to_string())?;

    let mut guard = state.settings.write().map_err(|_| "settings poisoned")?;
    *guard = new_settings;
    Ok(())
}
