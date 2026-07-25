use crate::error::ServiceResult;
use crate::now;
use sqlx::SqlitePool;

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

pub async fn mark_chapters_unread(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_ids: &[&str],
) -> ServiceResult<()> {
    if chapter_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    for chapter_id in chapter_ids {
        sqlx::query!(
            "DELETE FROM read_chapter
             WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
            source_id,
            manga_id,
            chapter_id
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
