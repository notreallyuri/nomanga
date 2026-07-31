use crate::{
    error::{CommandError, CommandResult},
    AppState,
};
use nomanga_core::data::chapter::{Chapter, Page};
use nomanga_core::data::homepage::Homepage;
use nomanga_core::data::manga::Manga;
use nomanga_core::extension::filter::Filter;
use nomanga_core::extension::query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef};
use nomanga_core::extension::rate_limit::SourceMethod;
use nomanga_core::extension::source::SourceInfo;
use nomanga_services::cache::source as source_cache;
use tauri::State;

async fn call_source<T, F>(
    state: &AppState,
    source_id: String,
    method: SourceMethod,
    f: F,
) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut nomanga_host::LoadedExtension, &str) -> nomanga_host::error::HostResult<T>
        + Send
        + 'static,
{
    let handle = {
        let registry = state.registry.read()?;
        registry.source(&source_id)?
    };

    let called_id = source_id.clone();

    tokio::task::spawn_blocking(move || handle.throttled(method, |ext| f(ext, &source_id)))
        .await
        .map_err(|e| CommandError::Internal {
            message: format!("task panicked: {e}"),
        })?
        .map_err(|e| CommandError::from(e).with_source_id(&called_id))
}

#[tauri::command]
#[specta::specta]
pub async fn list_sources(state: State<'_, AppState>) -> CommandResult<Vec<SourceInfo>> {
    let registry = state.registry.read()?;

    Ok(registry.sources())
}

// The one declaration not served straight off the snapshot. A source is free to
// build its filter options from the network -- nhentai fetches its tag list --
// and the snapshot is taken with the transport denied, so those come back empty
// and stay empty until the wasm changes. Asking the live source costs nothing
// extra in practice: filters are only requested for a source the user is already
// browsing, whose plugin the homepage call has compiled anyway.
//
// The snapshot is still the floor. A disabled source, a source that cannot
// compile, an offline first visit -- all of those keep the statically declared
// filters working instead of leaving the sheet empty.
#[tauri::command]
#[specta::specta]
pub async fn source_filters(
    state: State<'_, AppState>,
    source_id: String,
) -> CommandResult<Vec<Filter>> {
    let (handle, version) = {
        let registry = state.registry.read()?;
        let handle = registry.source(&source_id)?;
        let version = handle.info.version.clone();
        (handle, version)
    };

    if let Some(filters) = source_cache::get_filters(
        &state.pool,
        &source_id,
        &version,
        source_cache::default_ttl(),
    )
    .await?
    {
        return Ok(filters);
    }

    let fetch_id = source_id.clone();
    let fetched = tokio::task::spawn_blocking(move || {
        handle.with_plugin(|ext| ext.filters(&fetch_id))
    })
    .await
    .map_err(|e| CommandError::Internal {
        message: format!("task panicked: {e}"),
    })?;

    match fetched {
        Ok(filters) => {
            source_cache::set_filters(&state.pool, &source_id, &filters, &version).await?;
            Ok(filters)
        }
        Err(e) => {
            // Not cached: a snapshot answer is what we already had, and caching
            // it would keep the live list from being tried again for a day.
            let registry = state.registry.read()?;
            registry
                .filters(&source_id)
                .map_err(|_| CommandError::from(e).with_source_id(&source_id))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn source_homepage(
    state: State<'_, AppState>,
    source_id: String,
) -> CommandResult<Homepage> {
    call_source(&state, source_id, SourceMethod::Homepage, |ext, id| {
        ext.homepage(id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn source_search(
    state: State<'_, AppState>,
    source_id: String,
    query: SearchQuery,
) -> CommandResult<MangaPage> {
    call_source(&state, source_id, SourceMethod::Search, move |ext, id| {
        ext.search(id, query)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn source_section(
    state: State<'_, AppState>,
    source_id: String,
    section: SectionRef,
) -> CommandResult<MangaPage> {
    call_source(&state, source_id, SourceMethod::Section, move |ext, id| {
        ext.section(id, section)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn source_manga(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Manga> {
    let manga = call_source(&state, source_id.clone(), SourceMethod::Manga, move |ext, id| {
        ext.manga(id, MangaRef { manga_id })
    })
    .await?;

    nomanga_services::cache::manga::cache_manga(&state.pool, &source_id, &manga).await?;

    Ok(manga)
}

#[tauri::command]
#[specta::specta]
pub async fn source_chapters(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
) -> CommandResult<Vec<Chapter>> {
    let sid = source_id.clone();
    let mid = manga_id.clone();

    let chapters = call_source(&state, source_id, SourceMethod::Chapters, move |ext, id| {
        ext.chapters(id, MangaRef { manga_id })
    })
    .await?;

    // Reconcile the chapter cache against this live fetch (adds / rewrites /
    // removals) so every manga-details visit surfaces new chapters. A no-op for
    // series that aren't in the library.
    nomanga_services::library::sync_chapters(&state.pool, &sid, &mid, &chapters).await?;

    Ok(chapters)
}

#[tauri::command]
#[specta::specta]
pub async fn source_pages(
    state: State<'_, AppState>,
    source_id: String,
    manga_id: String,
    chapter_id: String,
) -> CommandResult<Vec<Page>> {
    call_source(&state, source_id, SourceMethod::Pages, move |ext, id| {
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
) -> CommandResult<String> {
    let configs = nomanga_services::source::config::all_configs(&state.pool).await?;
    let enabled = nomanga_services::source::preference::enabled_ids(&state.pool).await?;

    let mut registry = state.registry.write().map_err(|_| CommandError::Internal {
        message: "registry poisoned".into(),
    })?;

    let info = registry.install(&wasm_path, &configs)?;

    // Sources arrive compilable; a freshly installed one has no opt-in row yet
    // and must not build until the user turns it on.
    registry.set_enabled(&enabled)?;

    Ok(info.id)
}
