use crate::AppState;
use nomanga_services::StartupWarning;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn take_startup_warnings(
    state: State<'_, AppState>,
) -> Result<Vec<StartupWarning>, String> {
    let mut guard = state.startup_warnings.write().map_err(|_| "poisoned")?;
    Ok(std::mem::take(&mut *guard))
}
