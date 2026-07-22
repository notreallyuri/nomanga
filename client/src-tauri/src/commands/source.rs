use crate::AppState;
use nomanga_core::data::chapter::{Chapter, Page};
use nomanga_core::data::homepage::Homepage;
use nomanga_core::data::manga::Manga;
use nomanga_core::extension::filter::Filter;
use nomanga_core::extension::query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef};
use nomanga_core::extension::source::SourceInfo;
use tauri::State;

async fn call_source<T, F>(state: &AppState, source_id: String, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut nomanga_host::LoadedExtension, &str) -> nomanga_host::error::HostResult<T>
        + Send
        + 'static,
{
    let handle = {
        let registry = state.registry.read().map_err(|_| "registry poisoned")?;
        registry.source(&source_id).map_err(|e| e.to_string())?
    };

    tokio::task::spawn_blocking(move || handle.with_plugin(|ext| f(ext, &source_id)))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceInfo>, String> {
    let registry = state.registry.read().map_err(|_| "registry poisoned")?;
    Ok(registry.sources())
}

#[tauri::command]
#[specta::specta]
pub async fn source_filters(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<Vec<Filter>, String> {
    call_source(&state, source_id, |ext, id| ext.filters(id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn source_homepage(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<Homepage, String> {
    call_source(&state, source_id, |ext, id| ext.homepage(id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn source_search(
    state: State<'_, AppState>,
    source_id: String,
    query: SearchQuery,
) -> Result<MangaPage, String> {
    call_source(&state, source_id, move |ext, id| ext.search(id, query)).await
}

#[tauri::command]
#[specta::specta]
pub async fn source_section(
    state: State<'_, AppState>,
    source_id: String,
    section: SectionRef,
) -> Result<MangaPage, String> {
    call_source(&state, source_id, move |ext, id| ext.section(id, section)).await
}

#[tauri::command]
#[specta::specta]
pub async fn source_manga(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<Manga, String> {
    call_source(&state, source_id, move |ext, id| {
        ext.manga(id, MangaRef { manga_id })
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn source_chapters(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> Result<Vec<Chapter>, String> {
    call_source(&state, source_id, move |ext, id| {
        ext.chapters(id, MangaRef { manga_id })
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn source_pages(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> Result<Vec<Page>, String> {
    call_source(&state, source_id, move |ext, id| {
        ext.pages(
            id,
            ChapterRef {
                manga_id,
                chapter_id,
            },
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn install_extension(
    state: State<'_, AppState>,
    wasm_path: String,
) -> Result<String, String> {
    let mut registry = state.registry.write().map_err(|_| "registry poisoned")?;
    registry
        .install(&wasm_path)
        .map(|ext| ext.id)
        .map_err(|e| e.to_string())
}
