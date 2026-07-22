use crate::error::{ServiceError, ServiceResult};
use chrono::{DateTime, Utc};
use nomanga_core::data::manga::{Manga, Status};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[cfg(test)]
mod test;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItem {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub added_at: DateTime<Utc>,
    pub cached_total_chapters: i32,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
}

fn now() -> DateTime<Utc> {
    Utc::now()
}

pub async fn cache_manga(pool: &SqlitePool, source_id: &str, manga: &Manga) -> ServiceResult<()> {
    let authors = serde_json::to_string(&manga.author)?;
    let artists = serde_json::to_string(&manga.artist)?;
    let tags = serde_json::to_string(&manga.tags.iter().map(|t| &t.label).collect::<Vec<_>>())?;
    let status = status_str(&manga.status);

    let cached_at = now();

    sqlx::query!(
        "INSERT INTO manga
        (source_id, manga_id, title, cover_url, description,
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
        source_id,
        manga.id,
        manga.title,
        manga.cover_url,
        manga.description,
        authors,
        artists,
        tags,
        status,
        cached_at,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_to_library(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<()> {
    let cached = sqlx::query_scalar!(
        "select manga_id from manga where source_id = ? and manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_optional(pool)
    .await?;

    if cached.is_none() {
        return Err(ServiceError::MangaNotCached {
            source_id: source_id.to_owned(),
            manga_id: manga_id.to_owned(),
        });
    }

    let added_at = now();

    sqlx::query!(
        "INSERT INTO library_entry (source_id, manga_id, added_at)
         VALUES (?, ?, ?)
         ON CONFLICT (source_id, manga_id) DO NOTHING",
        source_id,
        manga_id,
        added_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn remove_from_library(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM library_entry WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn is_in_library(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<bool> {
    let row = sqlx::query_scalar!(
        "SELECT 1 FROM library_entry WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

pub async fn list_library(pool: &SqlitePool) -> ServiceResult<Vec<LibraryItem>> {
    let rows = sqlx::query_as!(
        LibraryItem,
        r#"SELECT le.source_id, le.manga_id, m.title, m.cover_url,
                  le.added_at AS "added_at: DateTime<Utc>",
                  le.cached_total_chapters AS "cached_total_chapters: i32"
           FROM library_entry le
           JOIN manga m ON m.source_id = le.source_id AND m.manga_id = le.manga_id
           ORDER BY le.added_at DESC"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_library_by_category(
    pool: &SqlitePool,
    category_id: &str,
) -> ServiceResult<Vec<LibraryItem>> {
    let rows = sqlx::query_as!(
        LibraryItem,
        r#"SELECT le.source_id, le.manga_id, m.title, m.cover_url,
                  le.added_at AS "added_at: DateTime<Utc>",
                  le.cached_total_chapters AS "cached_total_chapters: i32"
           FROM library_entry le
           JOIN manga m ON m.source_id = le.source_id AND m.manga_id = le.manga_id
           JOIN library_entry_category lec
                ON lec.source_id = le.source_id AND lec.manga_id = le.manga_id
           WHERE lec.category_id = ?
           ORDER BY le.added_at DESC"#,
        category_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn create_category(pool: &SqlitePool, name: &str) -> ServiceResult<String> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query!(
        "INSERT INTO category (id, name, sort_order) VALUES (?, ?, 0)",
        id,
        name,
    )
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn delete_category(pool: &SqlitePool, category_id: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM category WHERE id = ?", category_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn list_categories(pool: &SqlitePool) -> ServiceResult<Vec<Category>> {
    let rows = sqlx::query_as!(
        Category,
        r#"SELECT id, name, sort_order AS "sort_order: i32" FROM category ORDER BY sort_order, name"#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn assign_category(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    category_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "INSERT INTO library_entry_category (source_id, manga_id, category_id)
         VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING",
        source_id,
        manga_id,
        category_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn unassign_category(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    category_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM library_entry_category
         WHERE source_id = ? AND manga_id = ? AND category_id = ?",
        source_id,
        manga_id,
        category_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

fn status_str(status: &Status) -> &'static str {
    match status {
        Status::Ongoing => "Ongoing",
        Status::Completed => "Completed",
        Status::Hiatus => "Hiatus",
        Status::Cancelled => "Cancelled",
        Status::Unknown => "Unknown",
    }
}
