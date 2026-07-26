use crate::error::ServiceResult;
use crate::now;
use nomanga_core::data::chapter::Page;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

/// Source/manga/chapter ids can be arbitrary strings (often URLs), so every
/// path component is reduced to a filesystem-safe, traversal-proof encoding.
fn safe(component: &str) -> String {
    let mut out = String::with_capacity(component.len());
    for b in component.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn chapter_dir(root: &Path, source_id: &str, manga_id: &str, chapter_id: &str) -> PathBuf {
    root.join(safe(source_id))
        .join(safe(manga_id))
        .join(safe(chapter_id))
}

pub struct PageFile {
    pub number: u32,
    pub path: String,
}

pub async fn record_chapter(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
    pages: &[PageFile],
    total_bytes: u64,
) -> ServiceResult<()> {
    let page_count = pages.len() as i64;
    let bytes = total_bytes as i64;
    let ts = now();

    let mut tx = pool.begin().await?;

    sqlx::query!(
        "INSERT INTO downloaded_chapter
            (source_id, manga_id, chapter_id, page_count, total_bytes, downloaded_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id, chapter_id) DO UPDATE SET
            page_count = excluded.page_count,
            total_bytes = excluded.total_bytes,
            downloaded_at = excluded.downloaded_at",
        source_id,
        manga_id,
        chapter_id,
        page_count,
        bytes,
        ts,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        "DELETE FROM downloaded_page
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id,
    )
    .execute(&mut *tx)
    .await?;

    for page in pages {
        let number = page.number as i64;
        sqlx::query!(
            "INSERT INTO downloaded_page (source_id, manga_id, chapter_id, number, path)
             VALUES (?, ?, ?, ?, ?)",
            source_id,
            manga_id,
            chapter_id,
            number,
            page.path,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn is_downloaded(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<bool> {
    let row = sqlx::query!(
        "SELECT chapter_id FROM downloaded_chapter
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

pub async fn downloaded_chapter_ids(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<Vec<String>> {
    let ids = sqlx::query_scalar!(
        "SELECT chapter_id FROM downloaded_chapter
         WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(ids)
}

/// Downloaded pages as [`Page`]s whose `image_url` is the absolute path on
/// disk. Callers convert those to an asset URL for the webview.
pub async fn local_pages(
    pool: &SqlitePool,
    root: &Path,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<Vec<Page>> {
    let rows = sqlx::query!(
        "SELECT number, path FROM downloaded_page
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?
         ORDER BY number",
        source_id,
        manga_id,
        chapter_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Page {
            number: r.number as u32,
            image_url: root.join(r.path).to_string_lossy().into_owned(),
        })
        .collect())
}

pub async fn remove_chapter(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM downloaded_chapter
         WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id,
    )
    .execute(pool)
    .await?;

    Ok(())
}
