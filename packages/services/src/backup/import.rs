use super::{Backup, ImportMode, ImportReport};
use crate::error::ServiceResult;
use sqlx::SqlitePool;

pub async fn import(
    pool: &SqlitePool,
    backup: &Backup,
    mode: ImportMode,
    installed_extensions: &[String],
) -> ServiceResult<ImportReport> {
    let mut tx = pool.begin().await?;

    if mode == ImportMode::Replace {
        // library_entry_category and library_entry cascade off these two, so
        // clearing manga and category is enough to empty the library graph.
        sqlx::query!("DELETE FROM manga").execute(&mut *tx).await?;
        sqlx::query!("DELETE FROM category")
            .execute(&mut *tx)
            .await?;
        sqlx::query!("DELETE FROM read_chapter")
            .execute(&mut *tx)
            .await?;
        sqlx::query!("DELETE FROM read_progress")
            .execute(&mut *tx)
            .await?;
        sqlx::query!("DELETE FROM source_preference")
            .execute(&mut *tx)
            .await?;
        sqlx::query!("DELETE FROM source_setting")
            .execute(&mut *tx)
            .await?;
        sqlx::query!("DELETE FROM reader_override")
            .execute(&mut *tx)
            .await?;
    }

    let has_local_default = sqlx::query_scalar!(
        "SELECT EXISTS (SELECT 1 FROM category WHERE is_default = 1)"
    )
    .fetch_one(&mut *tx)
    .await?
        == 1;

    // Categories merge by name, so the same category coming from two devices
    // does not duplicate. Ids differ across devices, hence the remap.
    let mut category_ids = std::collections::HashMap::new();
    let mut categories_added = 0_u32;

    for category in &backup.categories {
        let existing =
            sqlx::query_scalar!("SELECT id FROM category WHERE name = ?", category.name)
                .fetch_optional(&mut *tx)
                .await?;

        if let Some(id) = existing {
            category_ids.insert(category.id.clone(), id);
            continue;
        }

        // Only one row may carry is_default; a local default always wins.
        let is_default = if has_local_default { 0 } else { category.is_default };

        sqlx::query!(
            "INSERT INTO category (id, name, sort_order, hidden, is_default, sort_mode, color, icon)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            category.id,
            category.name,
            category.sort_order,
            category.hidden,
            is_default,
            category.sort_mode,
            category.color,
            category.icon
        )
        .execute(&mut *tx)
        .await?;

        category_ids.insert(category.id.clone(), category.id.clone());
        categories_added += 1;
    }

    for row in &backup.manga {
        sqlx::query!(
            "INSERT INTO manga (source_id, manga_id, title, cover_url, description,
                                authors, artists, tags, status, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (source_id, manga_id) DO UPDATE SET
                 title = excluded.title,
                 cover_url = excluded.cover_url,
                 description = excluded.description,
                 authors = excluded.authors,
                 artists = excluded.artists,
                 tags = excluded.tags,
                 status = excluded.status,
                 cached_at = excluded.cached_at",
            row.source_id,
            row.manga_id,
            row.title,
            row.cover_url,
            row.description,
            row.authors,
            row.artists,
            row.tags,
            row.status,
            row.cached_at
        )
        .execute(&mut *tx)
        .await?;
    }

    let mut entries = 0_u32;
    for row in &backup.library {
        sqlx::query!(
            "INSERT INTO library_entry (source_id, manga_id, added_at,
                                        cached_total_chapters, last_checked_at, updates_cleared_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (source_id, manga_id) DO UPDATE SET
                 cached_total_chapters = excluded.cached_total_chapters,
                 last_checked_at = excluded.last_checked_at,
                 updates_cleared_at = excluded.updates_cleared_at",
            row.source_id,
            row.manga_id,
            row.added_at,
            row.cached_total_chapters,
            row.last_checked_at,
            row.updates_cleared_at
        )
        .execute(&mut *tx)
        .await?;
        entries += 1;
    }

    for row in &backup.entry_categories {
        let Some(category_id) = category_ids.get(&row.category_id) else {
            continue;
        };
        sqlx::query!(
            "INSERT OR IGNORE INTO library_entry_category (source_id, manga_id, category_id)
             VALUES (?, ?, ?)",
            row.source_id,
            row.manga_id,
            category_id
        )
        .execute(&mut *tx)
        .await?;
    }

    let mut read_chapters = 0_u32;
    for row in &backup.read_chapters {
        sqlx::query!(
            "INSERT OR IGNORE INTO read_chapter (source_id, manga_id, chapter_id, read_at)
             VALUES (?, ?, ?, ?)",
            row.source_id,
            row.manga_id,
            row.chapter_id,
            row.read_at
        )
        .execute(&mut *tx)
        .await?;
        read_chapters += 1;
    }

    let mut progress = 0_u32;
    for row in &backup.progress {
        // A merge must not rewind a series the local device read further into.
        sqlx::query!(
            "INSERT INTO read_progress (source_id, manga_id, last_chapter_id, last_page,
                                        last_chapter_done, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (source_id, manga_id) DO UPDATE SET
                 last_chapter_id = excluded.last_chapter_id,
                 last_page = excluded.last_page,
                 last_chapter_done = excluded.last_chapter_done,
                 updated_at = excluded.updated_at
             WHERE excluded.updated_at > read_progress.updated_at",
            row.source_id,
            row.manga_id,
            row.last_chapter_id,
            row.last_page,
            row.last_chapter_done,
            row.updated_at
        )
        .execute(&mut *tx)
        .await?;
        progress += 1;
    }

    for row in &backup.source_preferences {
        sqlx::query!(
            "INSERT INTO source_preference (source_id, enabled, private, blur_covers, skip_updates)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (source_id) DO UPDATE SET
                 enabled = excluded.enabled,
                 private = excluded.private,
                 blur_covers = excluded.blur_covers,
                 skip_updates = excluded.skip_updates",
            row.source_id,
            row.enabled,
            row.private,
            row.blur_covers,
            row.skip_updates
        )
        .execute(&mut *tx)
        .await?;
    }

    for row in &backup.source_settings {
        sqlx::query!(
            "INSERT INTO source_setting (source_id, key, value) VALUES (?, ?, ?)
             ON CONFLICT (source_id, key) DO UPDATE SET value = excluded.value",
            row.source_id,
            row.key,
            row.value
        )
        .execute(&mut *tx)
        .await?;
    }

    for row in &backup.reader_overrides {
        sqlx::query!(
            "INSERT INTO reader_override (source_id, manga_id, data) VALUES (?, ?, ?)
             ON CONFLICT (source_id, manga_id) DO UPDATE SET data = excluded.data",
            row.source_id,
            row.manga_id,
            row.data
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let missing_extensions = backup
        .extensions
        .iter()
        .filter(|e| !installed_extensions.contains(&e.id))
        .cloned()
        .collect();

    Ok(ImportReport {
        entries,
        categories: categories_added,
        read_chapters,
        progress,
        missing_extensions,
    })
}
