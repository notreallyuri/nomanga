use crate::AppState;
use nomanga_services::history::{self, ContinueReadingItem, ReadProgress};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn continue_reading(
    state: State<'_, AppState>,
    limit: i32,
) -> Result<Vec<ContinueReadingItem>, String> {
    history::continue_reading(&state.pool, limit as i64)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapter_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> Result<(), String> {
    history::mark_chapter_read(&state.pool, &source_id, &manga_id, &chapter_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapter_unread(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> Result<(), String> {
    history::mark_chapter_unread(&state.pool, &source_id, &manga_id, &chapter_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapters_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_ids: Vec<String>,
) -> Result<(), String> {
    let refs: Vec<&str> = chapter_ids.iter().map(String::as_str).collect();

    history::mark_chapters_read(&state.pool, &source_id, &manga_id, &refs)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_chapter_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> Result<bool, String> {
    history::is_chapter_read(&state.pool, &source_id, &manga_id, &chapter_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn read_chapters_for_manga(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<Vec<String>, String> {
    history::read_chapters_for_manga(&state.pool, &source_id, &manga_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn read_count(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<i32, String> {
    history::read_count(&state.pool, &source_id, &manga_id)
        .await
        .map(|n| n as i32)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn update_progress(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
    page: i32,
    chapter_done: bool,
) -> Result<(), String> {
    history::update_progress(
        &state.pool,
        &source_id,
        &manga_id,
        &chapter_id,
        page as i64,
        chapter_done,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_progress(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<Option<ReadProgress>, String> {
    history::get_progress(&state.pool, &source_id, &manga_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn finish_chapter(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
    last_page: i32,
) -> Result<(), String> {
    history::finish_chapter(
        &state.pool,
        &source_id,
        &manga_id,
        &chapter_id,
        last_page as i64,
    )
    .await
    .map_err(|e| e.to_string())
}
