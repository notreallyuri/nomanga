use crate::downloads::{DownloadProgress, DownloadTarget};
use crate::{error::CommandResult, AppState};
use nomanga_core::data::chapter::Page;
use nomanga_services::downloads::{self, DownloadedManga};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_downloads(state: State<'_, AppState>) -> CommandResult<Vec<DownloadedManga>> {
    Ok(downloads::list_downloads(&state.pool).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn queue_downloads(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    manga_title: String,
    targets: Vec<DownloadTarget>,
) -> CommandResult<()> {
    // Written down before the queue takes them: a batch interrupted by closing
    // the app is restored on the next start rather than silently lost.
    let pending: Vec<downloads::PendingDownload> = targets
        .iter()
        .map(|target| downloads::PendingDownload {
            source_id: source_id.clone(),
            manga_id: manga_id.clone(),
            manga_title: manga_title.clone(),
            chapter_id: target.chapter_id.clone(),
            title: target.title.clone(),
        })
        .collect();

    downloads::remember_pending(&state.pool, &pending).await?;

    state
        .downloads
        .enqueue(source_id, manga_id, manga_title, targets);
    Ok(())
}

/// Everything queued or downloading right now.
///
/// Progress events are sent once and never replayed, so a frontend that has just
/// started — or reloaded mid-queue — reads this to see the work already under
/// way instead of learning about a chapter only when its turn comes.
#[tauri::command]
#[specta::specta]
pub async fn download_queue(state: State<'_, AppState>) -> CommandResult<Vec<DownloadProgress>> {
    Ok(state.downloads.snapshot())
}

#[tauri::command]
#[specta::specta]
pub async fn set_downloads_paused(state: State<'_, AppState>, paused: bool) -> CommandResult<()> {
    state.downloads.set_paused(paused);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn downloads_paused(state: State<'_, AppState>) -> CommandResult<bool> {
    Ok(state.downloads.is_paused())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_download(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<()> {
    downloads::forget_pending(&state.pool, &source_id, &manga_id, &chapter_id).await?;
    state.downloads.cancel(source_id, manga_id, chapter_id);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_all_downloads(state: State<'_, AppState>) -> CommandResult<()> {
    // Dropped here as well as in the worker: a cancelled job only clears its own
    // row when the worker reaches it, and the app may close first.
    downloads::forget_all_pending(&state.pool).await?;
    state.downloads.cancel_all();
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
    Ok(downloads::local_pages(
        &state.pool,
        &state.downloads_dir,
        &source_id,
        &manga_id,
        &chapter_id,
    )
    .await?)
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
