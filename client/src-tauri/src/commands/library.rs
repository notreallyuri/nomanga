use crate::{error::CommandResult, AppState};
use nomanga_core::data::manga::{Manga, MangaSimple};
use nomanga_services::library::{
    self, Category, CategoryCount, CategoryFilter, CategoryOptions, EntryRef, LibraryItem,
};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_library(
    state: State<'_, AppState>,
    filter: CategoryFilter,
) -> CommandResult<Vec<LibraryItem>> {
    let res = library::list_library(&state.pool, &filter).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn add_to_library(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<()> {
    library::add_to_library(&state.pool, &source_id, &manga_id).await?;

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
) -> CommandResult<()> {
    library::add_manga_to_library(&state.pool, &source_id, &manga).await?;

    Ok(())
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
