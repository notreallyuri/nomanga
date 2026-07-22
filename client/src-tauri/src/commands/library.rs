use crate::AppState;
use nomanga_services::library::{self, Category, LibraryItem};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_library(state: State<'_, AppState>) -> Result<Vec<LibraryItem>, String> {
    library::list_library(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn add_to_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<(), String> {
    library::add_to_library(&state.pool, &source_id, &manga_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn remove_from_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<(), String> {
    library::remove_from_library(&state.pool, &source_id, &manga_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_in_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<bool, String> {
    library::is_in_library(&state.pool, &source_id, &manga_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    library::list_categories(&state.pool)
        .await
        .map_err(|e| e.to_string())
}
