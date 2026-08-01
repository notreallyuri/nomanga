use crate::{
    commands::LibraryRefreshProgress, error::CommandError, error::CommandResult, AppState,
};
use nomanga_core::data::manga::{Manga, MangaSimple};
use nomanga_core::extension::query::MangaRef;
use nomanga_core::extension::rate_limit::SourceMethod;
use nomanga_host::registry::Registry;
use nomanga_services::library::{
    self, Category, CategoryCount, CategoryFilter, CategoryOptions, EntryRef, LibraryItem,
    LibrarySearch, LibraryUpdate, RefreshScope,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::State;
use tauri_specta::Event;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RefreshSummary {
    pub checked: u32,
    pub new_chapters: u32,
    /// True when the run stopped early. `checked` still reports the series that
    /// did complete, so a cancelled run is reported as partial rather than as
    /// nothing having happened.
    pub cancelled: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_library(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    scope: RefreshScope,
    force: bool,
) -> CommandResult<RefreshSummary> {
    run_refresh(
        &state.pool,
        &state.registry,
        &app,
        scope,
        force,
        &state.refresh_cancel,
    )
    .await
}

/// Stops the running refresh after the series in flight. Nothing is undone: a
/// series is committed by `sync_chapters` only once its whole chapter list is
/// back, so the boundary between series is already a safe place to stop and
/// there is no partial state to clean up — unlike a download, which owns files.
///
/// Setting the flag with no run in progress is harmless; the next run clears it
/// before checking anything.
#[tauri::command]
#[specta::specta]
pub async fn cancel_library_refresh(state: State<'_, AppState>) -> CommandResult<()> {
    state.refresh_cancel.store(true, Ordering::Relaxed);

    Ok(())
}

/// Shared refresh engine for the `refresh_library` command and the background
/// loop; streams `LibraryRefreshProgress` events so any listener can show it.
pub async fn run_refresh(
    pool: &SqlitePool,
    registry: &Arc<RwLock<Registry>>,
    app: &tauri::AppHandle,
    scope: RefreshScope,
    force: bool,
    cancel: &Arc<AtomicBool>,
) -> CommandResult<RefreshSummary> {
    // Cleared here rather than after the loop so a cancel raised once the
    // previous run had already ended cannot carry into this one.
    cancel.store(false, Ordering::Relaxed);

    let targets = library::entries_to_refresh(pool, &scope, force).await?;
    let total = targets.len() as u32;

    let mut checked = 0u32;
    let mut new_chapters = 0u32;
    let mut cancelled = false;

    for (index, target) in targets.iter().enumerate() {
        // Checked before the fetch rather than after, so cancelling does not
        // still pay for one more round trip to a source.
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }

        LibraryRefreshProgress {
            done: index as u32,
            total,
            current_title: target.title.clone(),
        }
        .emit(app)
        .ok();

        let handle = {
            let registry = registry.read()?;
            registry.source(&target.source_id)?
        };

        let manga_id = target.manga_id.clone();
        let source_id = target.source_id.clone();
        let fetched = tokio::task::spawn_blocking(move || {
            handle.throttled(SourceMethod::Chapters, |ext| {
                ext.chapters(&source_id, MangaRef { manga_id })
            })
        })
        .await
        .map_err(|e| CommandError::Internal {
            message: format!("task panicked: {e}"),
        })?;

        // A single flaky source shouldn't abort the whole run.
        if let Ok(chapters) = fetched {
            new_chapters +=
                library::sync_chapters(pool, &target.source_id, &target.manga_id, &chapters)
                    .await?;
            checked += 1;
        }

        library::mark_checked(pool, &target.source_id, &target.manga_id).await?;
    }

    // Terminal event either way. Listeners treat `done == total` as "the run is
    // over" and clear their progress on it, so a cancelled run has to send one
    // too or the UI would sit on a bar that never finishes. What actually
    // happened is carried by the summary, not by the counts.
    LibraryRefreshProgress {
        done: total,
        total,
        current_title: String::new(),
    }
    .emit(app)
    .ok();

    Ok(RefreshSummary {
        checked,
        new_chapters,
        cancelled,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn library_updates(
    state: State<'_, AppState>,
    limit: u32,
) -> CommandResult<Vec<LibraryUpdate>> {
    let res = library::library_updates(&state.pool, limit as i64).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_library_updates(state: State<'_, AppState>) -> CommandResult<()> {
    library::clear_updates(&state.pool).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_library(
    state: State<'_, AppState>,
    filter: CategoryFilter,
    search: Option<LibrarySearch>,
) -> CommandResult<Vec<LibraryItem>> {
    let res = library::list_library(&state.pool, &filter, search.as_ref()).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn add_to_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    total_chapters: Option<i32>,
) -> CommandResult<()> {
    library::add_to_library(&state.pool, &source_id, &manga_id, total_chapters).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn add_listing_to_library(
    state: State<'_, AppState>,
    source_id: String,
    item: MangaSimple,
) -> CommandResult<()> {
    library::add_listing_to_library(&state.pool, &source_id, &item).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn add_manga_to_library(
    state: State<'_, AppState>,
    source_id: String,
    manga: Manga,
    total_chapters: Option<i32>,
) -> CommandResult<()> {
    library::add_manga_to_library(&state.pool, &source_id, &manga, total_chapters).await?;

    Ok(())
}

/// Fills the chapter cache for one entry without the progress events a full
/// refresh emits — used right after an add whose caller had no chapter count.
#[tauri::command]
#[specta::specta]
pub async fn cache_entry_chapters(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<u32> {
    let handle = {
        let registry = state.registry.read()?;
        registry.source(&source_id)?
    };

    let called_id = source_id.clone();
    let fetch_id = source_id.clone();
    let fetch_manga_id = manga_id.clone();

    let chapters = tokio::task::spawn_blocking(move || {
        handle.throttled(SourceMethod::Chapters, |ext| {
            ext.chapters(
                &fetch_id,
                MangaRef {
                    manga_id: fetch_manga_id.clone(),
                },
            )
        })
    })
    .await
    .map_err(|e| CommandError::Internal {
        message: format!("task panicked: {e}"),
    })?
    .map_err(|e| CommandError::from(e).with_source_id(&called_id))?;

    let added = library::sync_chapters(&state.pool, &source_id, &manga_id, &chapters).await?;

    Ok(added)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_from_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<()> {
    library::remove_from_library(&state.pool, &source_id, &manga_id).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn is_in_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<bool> {
    let res = library::is_in_library(&state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn list_categories(state: State<'_, AppState>) -> CommandResult<Vec<Category>> {
    let res = library::list_categories(&state.pool).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn library_lock_is_set(state: State<'_, AppState>) -> CommandResult<bool> {
    let res = library::lock::has_password(&state.pool).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn verify_library_password(
    state: State<'_, AppState>,
    password: String,
) -> CommandResult<bool> {
    let res = library::lock::verify_password(&state.pool, &password).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn set_library_password(
    state: State<'_, AppState>,
    current: Option<String>,
    password: String,
) -> CommandResult<()> {
    library::lock::set_password(&state.pool, current.as_deref(), &password).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn clear_library_lock(state: State<'_, AppState>) -> CommandResult<()> {
    library::lock::clear_password(&state.pool).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn create_category(state: State<'_, AppState>, name: String) -> CommandResult<Category> {
    let res = library::create_category(&state.pool, &name).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_category(
    state: State<'_, AppState>,
    category_id: String,
    name: String,
) -> CommandResult<()> {
    library::rename_category(&state.pool, &category_id, &name).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn update_category_options(
    state: State<'_, AppState>,
    category_id: String,
    options: CategoryOptions,
) -> CommandResult<()> {
    library::update_category_options(&state.pool, &category_id, &options).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_category(state: State<'_, AppState>, category_id: String) -> CommandResult<()> {
    library::delete_category(&state.pool, &category_id).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn reorder_categories(
    state: State<'_, AppState>,
    category_ids: Vec<String>,
) -> CommandResult<()> {
    let refs: Vec<&str> = category_ids.iter().map(String::as_str).collect();

    library::reorder_categories(&state.pool, &refs).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn categories_for_entry(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Vec<String>> {
    let res = library::categories_for_entry(&state.pool, &source_id, &manga_id).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn bulk_category_counts(
    state: State<'_, AppState>,
    entries: Vec<EntryRef>,
) -> CommandResult<Vec<CategoryCount>> {
    let res = library::category_counts_for_entries(&state.pool, &entries).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn bulk_update_categories(
    state: State<'_, AppState>,
    entries: Vec<EntryRef>,
    add: Vec<String>,
    remove: Vec<String>,
) -> CommandResult<()> {
    let add_refs: Vec<&str> = add.iter().map(String::as_str).collect();
    let remove_refs: Vec<&str> = remove.iter().map(String::as_str).collect();

    library::bulk_update_categories(&state.pool, &entries, &add_refs, &remove_refs).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_entry_categories(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    category_ids: Vec<String>,
) -> CommandResult<()> {
    let refs: Vec<&str> = category_ids.iter().map(String::as_str).collect();

    library::set_entry_categories(&state.pool, &source_id, &manga_id, &refs).await?;

    Ok(())
}
