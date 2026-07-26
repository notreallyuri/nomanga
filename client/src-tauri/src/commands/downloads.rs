use crate::downloads::DownloadTarget;
use crate::{error::CommandResult, AppState};
use nomanga_core::data::chapter::Page;
use nomanga_services::downloads;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn queue_downloads(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    manga_title: String,
    targets: Vec<DownloadTarget>,
) -> CommandResult<()> {
    state
        .downloads
        .enqueue(source_id, manga_id, manga_title, targets);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn downloaded_chapter_ids(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Vec<String>> {
    Ok(downloads::downloaded_chapter_ids(&state.pool, &source_id, &manga_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn local_pages(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<Vec<Page>> {
    Ok(downloads::local_pages(&state.pool, &state.downloads_dir, &source_id, &manga_id, &chapter_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_download(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<()> {
    let dir = downloads::chapter_dir(&state.downloads_dir, &source_id, &manga_id, &chapter_id);
    downloads::remove_chapter(&state.pool, &source_id, &manga_id, &chapter_id).await?;
    tokio::fs::remove_dir_all(&dir).await.ok();
    Ok(())
}
