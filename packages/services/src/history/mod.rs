use crate::error::ServiceResult;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[cfg(test)]
mod test;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadProgress {
    pub source_id: String,
    pub manga_id: String,
    pub last_chapter_id: String,
    pub last_page: i32,
    pub last_chapter_done: bool,
    pub updated_at: DateTime<Utc>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinueReadingItem {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub last_chapter_id: String,
    pub last_page: i32,
    pub last_chapter_done: bool,
    pub updated_at: DateTime<Utc>,
}

fn now() -> DateTime<Utc> {
    Utc::now()
}

pub async fn mark_chapter_read(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<()> {
    let read_at = now();
    sqlx::query!(
        "INSERT INTO read_chapter (source_id, manga_id, chapter_id, read_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id, chapter_id) DO NOTHING",
        source_id,
        manga_id,
        chapter_id,
        read_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_chapter_unread(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM read_chapter
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_chapters_read(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_ids: &[&str],
) -> ServiceResult<()> {
    if chapter_ids.is_empty() {
        return Ok(());
    }
    let read_at = now();
    let mut tx = pool.begin().await?;
    for chapter_id in chapter_ids {
        sqlx::query!(
            "INSERT INTO read_chapter (source_id, manga_id, chapter_id, read_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (source_id, manga_id, chapter_id) DO NOTHING",
            source_id,
            manga_id,
            chapter_id,
            read_at
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn is_chapter_read(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<bool> {
    let row = sqlx::query_scalar!(
        "SELECT 1 FROM read_chapter
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

pub async fn read_chapters_for_manga(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<Vec<String>> {
    let ids = sqlx::query_scalar!(
        "SELECT chapter_id FROM read_chapter
         WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn read_count(pool: &SqlitePool, source_id: &str, manga_id: &str) -> ServiceResult<i64> {
    let count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM read_chapter
         WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn update_progress(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
    page: i64,
    chapter_done: bool,
) -> ServiceResult<()> {
    let updated_at = now();
    let done = chapter_done as i64;
    sqlx::query!(
        "INSERT INTO read_progress
            (source_id, manga_id, last_chapter_id, last_page,
             last_chapter_done, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id) DO UPDATE SET
             last_chapter_id = excluded.last_chapter_id,
             last_page = excluded.last_page,
             last_chapter_done = excluded.last_chapter_done,
             updated_at = excluded.updated_at",
        source_id,
        manga_id,
        chapter_id,
        page,
        done,
        updated_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_progress(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<Option<ReadProgress>> {
    let row = sqlx::query!(
        r#"SELECT source_id, manga_id, last_chapter_id, last_page,
              last_chapter_done, updated_at AS "updated_at: DateTime<Utc>"
       FROM read_progress
       WHERE source_id = ? AND manga_id = ?"#,
        source_id,
        manga_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| ReadProgress {
        source_id: r.source_id,
        manga_id: r.manga_id,
        last_chapter_id: r.last_chapter_id,
        last_page: r.last_page as i32,
        last_chapter_done: r.last_chapter_done != 0,
        updated_at: r.updated_at,
    }))
}

pub async fn finish_chapter(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
    last_page: i64,
) -> ServiceResult<()> {
    let ts = now();
    let mut tx = pool.begin().await?;

    sqlx::query!(
        "INSERT INTO read_chapter (source_id, manga_id, chapter_id, read_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id, chapter_id) DO NOTHING",
        source_id,
        manga_id,
        chapter_id,
        ts
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        "INSERT INTO read_progress
            (source_id, manga_id, last_chapter_id, last_page,
             last_chapter_done, updated_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT (source_id, manga_id) DO UPDATE SET
             last_chapter_id = excluded.last_chapter_id,
             last_page = excluded.last_page,
             last_chapter_done = 1,
             updated_at = excluded.updated_at",
        source_id,
        manga_id,
        chapter_id,
        last_page,
        ts
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn continue_reading(
    pool: &SqlitePool,
    limit: i64,
) -> ServiceResult<Vec<ContinueReadingItem>> {
    let rows = sqlx::query!(
        r#"SELECT rp.source_id, rp.manga_id, m.title, m.cover_url,
                  rp.last_chapter_id, rp.last_page, rp.last_chapter_done,
                  rp.updated_at AS "updated_at: DateTime<Utc>"
           FROM read_progress rp
           JOIN manga m ON m.source_id = rp.source_id AND m.manga_id = rp.manga_id
           ORDER BY rp.updated_at DESC
           LIMIT ?"#,
        limit
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ContinueReadingItem {
            source_id: r.source_id,
            manga_id: r.manga_id,
            title: r.title,
            cover_url: r.cover_url,
            last_chapter_id: r.last_chapter_id,
            last_page: r.last_page as i32,
            last_chapter_done: r.last_chapter_done != 0,
            updated_at: r.updated_at,
        })
        .collect())
}
