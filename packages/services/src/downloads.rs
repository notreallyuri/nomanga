use crate::error::ServiceResult;
use crate::now;
use nomanga_core::data::chapter::Page;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

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
    title: &str,
    pages: &[PageFile],
    total_bytes: u64,
) -> ServiceResult<()> {
    let page_count = pages.len() as i64;
    let bytes = total_bytes as i64;
    let ts = now();

    let mut tx = pool.begin().await?;

    sqlx::query!(
        "INSERT INTO downloaded_chapter
            (source_id, manga_id, chapter_id, title, page_count, total_bytes, downloaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id, chapter_id) DO UPDATE SET
            title = excluded.title,
            page_count = excluded.page_count,
            total_bytes = excluded.total_bytes,
            downloaded_at = excluded.downloaded_at",
        source_id,
        manga_id,
        chapter_id,
        title,
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

#[derive(Debug, Clone)]
pub struct PendingDownload {
    pub source_id: String,
    pub manga_id: String,
    pub manga_title: String,
    pub chapter_id: String,
    pub title: String,
}

pub async fn remember_pending(
    pool: &SqlitePool,
    entries: &[PendingDownload],
) -> ServiceResult<()> {
    if entries.is_empty() {
        return Ok(());
    }

    let queued_at = now();
    let mut tx = pool.begin().await?;

    for entry in entries {
        sqlx::query!(
            "INSERT INTO download_queue
                (source_id, manga_id, manga_title, chapter_id, title, queued_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (source_id, manga_id, chapter_id) DO NOTHING",
            entry.source_id,
            entry.manga_id,
            entry.manga_title,
            entry.chapter_id,
            entry.title,
            queued_at
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn forget_pending(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM download_queue
          WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
        source_id,
        manga_id,
        chapter_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn forget_all_pending(pool: &SqlitePool) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM download_queue")
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn pending_downloads(pool: &SqlitePool) -> ServiceResult<Vec<PendingDownload>> {
    sqlx::query!("DELETE FROM download_queue AS q
                   WHERE EXISTS (SELECT 1 FROM downloaded_chapter dc
                                  WHERE dc.source_id = q.source_id
                                    AND dc.manga_id = q.manga_id
                                    AND dc.chapter_id = q.chapter_id)")
        .execute(pool)
        .await?;

    let rows = sqlx::query!(
        "SELECT source_id, manga_id, manga_title, chapter_id, title
           FROM download_queue ORDER BY seq"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| PendingDownload {
            source_id: r.source_id,
            manga_id: r.manga_id,
            manga_title: r.manga_title,
            chapter_id: r.chapter_id,
            title: r.title,
        })
        .collect())
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

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DownloadedChapter {
    pub source_id: String,
    pub manga_id: String,
    pub chapter_id: String,
    pub title: String,
    pub page_count: u32,
    pub total_bytes: f64,
    pub downloaded_at: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DownloadedManga {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub total_bytes: f64,
    pub chapters: Vec<DownloadedChapter>,
}

pub async fn list_downloads(pool: &SqlitePool) -> ServiceResult<Vec<DownloadedManga>> {
    let rows = sqlx::query!(
        r#"SELECT
            dc.source_id AS "source_id!",
            dc.manga_id AS "manga_id!",
            dc.chapter_id AS "chapter_id!",
            CASE WHEN dc.title = '' THEN dc.chapter_id ELSE dc.title END AS "title!",
            dc.page_count AS "page_count!",
            dc.total_bytes AS "total_bytes!",
            dc.downloaded_at AS "downloaded_at!",
            COALESCE(m.title, dc.manga_id) AS "manga_title!",
            COALESCE(m.cover_url, '') AS "cover_url!"
        FROM downloaded_chapter dc
        LEFT JOIN manga m
            ON m.source_id = dc.source_id AND m.manga_id = dc.manga_id
        ORDER BY COALESCE(m.title, dc.manga_id), dc.source_id, dc.manga_id, dc.downloaded_at"#
    )
    .fetch_all(pool)
    .await?;

    let mut out: Vec<DownloadedManga> = Vec::new();
    for row in rows {
        let bytes = row.total_bytes as f64;
        let chapter = DownloadedChapter {
            source_id: row.source_id.clone(),
            manga_id: row.manga_id.clone(),
            chapter_id: row.chapter_id,
            title: row.title,
            page_count: row.page_count as u32,
            total_bytes: bytes,
            downloaded_at: row.downloaded_at,
        };

        match out.last_mut() {
            Some(m) if m.source_id == row.source_id && m.manga_id == row.manga_id => {
                m.total_bytes += bytes;
                m.chapters.push(chapter);
            }
            _ => out.push(DownloadedManga {
                source_id: row.source_id,
                manga_id: row.manga_id,
                title: row.manga_title,
                cover_url: row.cover_url,
                total_bytes: bytes,
                chapters: vec![chapter],
            }),
        }
    }

    Ok(out)
}
