use crate::{error::CommandResult, AppState};
use nomanga_services::StartupWarning;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn take_startup_warnings(
    state: State<'_, AppState>,
) -> CommandResult<Vec<StartupWarning>> {
    let mut guard = state.startup_warnings.write()?;

    Ok(std::mem::take(&mut *guard))
}
