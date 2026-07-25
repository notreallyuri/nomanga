use crate::{error::CommandResult, AppState};
use nomanga_services::history::{self, ContinueReadingItem, ReadProgress};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntryRef {
    pub source_id: String,
    pub manga_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn continue_reading(
    state: State<'_, AppState>,
    limit: i32,
) -> CommandResult<Vec<ContinueReadingItem>> {
    let res = history::continue_reading(&state.pool, limit as i64).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_history_entries(
    state: State<'_, AppState>,
    entries: Vec<HistoryEntryRef>,
) -> CommandResult<()> {
    let refs: Vec<(&str, &str)> = entries
        .iter()
        .map(|e| (e.source_id.as_str(), e.manga_id.as_str()))
        .collect();

    history::remove_progress_many(&state.pool, &refs).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapter_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<()> {
    history::mark_chapter_read(&state.pool, &source_id, &manga_id, &chapter_id).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapter_unread(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<()> {
    history::mark_chapter_unread(&state.pool, &source_id, &manga_id, &chapter_id).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapters_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_ids: Vec<String>,
) -> CommandResult<()> {
    let refs: Vec<&str> = chapter_ids.iter().map(String::as_str).collect();

    history::mark_chapters_read(&state.pool, &source_id, &manga_id, &refs).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chapters_unread(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_ids: Vec<String>,
) -> CommandResult<()> {
    let refs: Vec<&str> = chapter_ids.iter().map(String::as_str).collect();

    history::mark_chapters_unread(&state.pool, &source_id, &manga_id, &refs).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn is_chapter_read(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<bool> {
    let res = history::is_chapter_read(&state.pool, &source_id, &manga_id, &chapter_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn read_chapters_for_manga(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Vec<String>> {
    let res = history::read_chapters_for_manga(&state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn read_count(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<i32> {
    let res = history::read_count(&state.pool, &source_id, &manga_id)
        .await
        .map(|n| n as i32)?;

    Ok(res)
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
) -> CommandResult<()> {
    history::update_progress(
        &state.pool,
        &source_id,
        &manga_id,
        &chapter_id,
        page as i64,
        chapter_done,
    )
    .await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_progress(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Option<ReadProgress>> {
    let res = history::get_progress(&state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn finish_chapter(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
    last_page: i32,
) -> CommandResult<()> {
    history::finish_chapter(
        &state.pool,
        &source_id,
        &manga_id,
        &chapter_id,
        last_page as i64,
    )
    .await?;

    Ok(())
}
