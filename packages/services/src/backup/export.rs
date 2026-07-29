use super::rows::{
    CategoryRow, EntryCategoryRow, LibraryEntryRow, MangaRow, ProgressRow, ReadChapterRow,
    ReaderOverrideRow, RepositoryRow, SourcePreferenceRow, SourceSettingRow,
};
use super::{Backup, ExtensionRef, VERSION};
use crate::error::ServiceResult;
use crate::now;
use crate::settings::Settings;
use sqlx::SqlitePool;

pub async fn export(
    pool: &SqlitePool,
    settings: &Settings,
    app_version: &str,
    extensions: Vec<ExtensionRef>,
) -> ServiceResult<Backup> {
    // Only manga backing a library entry: library_entry has an FK onto manga,
    // so these rows are structural, not cache. The rest of the manga cache is
    // refetchable and would bloat the file.
    let manga = sqlx::query_as!(
        MangaRow,
        r#"SELECT m.source_id, m.manga_id, m.title, m.cover_url, m.description,
                  m.authors, m.artists, m.tags, m.status, m.cached_at
           FROM manga m
           JOIN library_entry e ON e.source_id = m.source_id AND e.manga_id = m.manga_id"#
    )
    .fetch_all(pool)
    .await?;

    let library = sqlx::query_as!(
        LibraryEntryRow,
        r#"SELECT source_id, manga_id, added_at,
                  cached_total_chapters, last_checked_at, updates_cleared_at
           FROM library_entry"#
    )
    .fetch_all(pool)
    .await?;

    let categories = sqlx::query_as!(
        CategoryRow,
        r#"SELECT id, name, sort_order, hidden, locked, is_default, sort_mode, color, icon
           FROM category"#
    )
    .fetch_all(pool)
    .await?;

    let entry_categories = sqlx::query_as!(
        EntryCategoryRow,
        "SELECT source_id, manga_id, category_id FROM library_entry_category"
    )
    .fetch_all(pool)
    .await?;

    let read_chapters = sqlx::query_as!(
        ReadChapterRow,
        "SELECT source_id, manga_id, chapter_id, read_at FROM read_chapter"
    )
    .fetch_all(pool)
    .await?;

    let progress = sqlx::query_as!(
        ProgressRow,
        r#"SELECT source_id, manga_id, last_chapter_id, last_page,
                  last_chapter_done, updated_at
           FROM read_progress"#
    )
    .fetch_all(pool)
    .await?;

    let source_preferences = sqlx::query_as!(
        SourcePreferenceRow,
        "SELECT source_id, enabled, private, blur_covers, skip_updates, default_category_id
         FROM source_preference"
    )
    .fetch_all(pool)
    .await?;

    let source_settings = sqlx::query_as!(
        SourceSettingRow,
        "SELECT source_id, key, value FROM source_setting"
    )
    .fetch_all(pool)
    .await?;

    let reader_overrides = sqlx::query_as!(
        ReaderOverrideRow,
        "SELECT source_id, manga_id, data FROM reader_override"
    )
    .fetch_all(pool)
    .await?;

    let repositories = sqlx::query_as!(
        RepositoryRow,
        "SELECT url, name, added_at FROM extension_repository"
    )
    .fetch_all(pool)
    .await?;

    Ok(Backup {
        version: VERSION,
        created_at: now(),
        app_version: app_version.to_owned(),
        settings: settings.clone(),
        extensions,
        manga,
        library,
        categories,
        entry_categories,
        read_chapters,
        progress,
        source_preferences,
        source_settings,
        reader_overrides,
        repositories,
    })
}
