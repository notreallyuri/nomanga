use crate::error::ServiceResult;
use crate::library::entries::EntryRef;
use crate::now;
use chrono::{DateTime, Duration, Utc};
use nomanga_core::data::chapter::Chapter;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashSet;

const THROTTLE_HOURS: i64 = 6;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RefreshScope {
    All,
    Category { id: String },
    Entries { entries: Vec<EntryRef> },
}

pub struct RefreshTarget {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryUpdate {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub new_count: i32,
    pub latest_chapter_id: String,
    pub latest_chapter_title: String,
    pub latest_number: f64,
    pub found_at: DateTime<Utc>,
}

pub async fn sync_chapters(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    chapters: &[Chapter],
) -> ServiceResult<u32> {
    let added_at = sqlx::query_scalar!(
        r#"SELECT added_at AS "added_at: DateTime<Utc>"
             FROM library_entry WHERE source_id = ? AND manga_id = ?"#,
        source_id,
        manga_id
    )
    .fetch_optional(pool)
    .await?;

    let Some(added_at) = added_at else {
        return Ok(0);
    };

    let existing: Vec<String> = sqlx::query_scalar!(
        "SELECT chapter_id FROM cached_chapter WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_all(pool)
    .await?;

    let seeding = existing.is_empty();
    let existing_set: HashSet<&str> = existing.iter().map(String::as_str).collect();
    let fetched_set: HashSet<&str> = chapters.iter().map(|c| c.id.as_str()).collect();

    let now = now();
    let mut new_count = 0u32;
    let mut tx = pool.begin().await?;

    for chapter in chapters {
        let number = chapter.number as f64;
        let volume = chapter.volume.map(|v| v as f64);

        if existing_set.contains(chapter.id.as_str()) {
            sqlx::query!(
                "UPDATE cached_chapter
                    SET number = ?, title = ?, volume = ?, language = ?,
                        upload_date = ?, url = ?
                  WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
                number,
                chapter.title,
                volume,
                chapter.language,
                chapter.upload_date,
                chapter.url,
                source_id,
                manga_id,
                chapter.id
            )
            .execute(&mut *tx)
            .await?;
        } else {
            let first_seen = if seeding { added_at } else { now };
            if !seeding {
                new_count += 1;
            }

            sqlx::query!(
                "INSERT INTO cached_chapter
                    (source_id, manga_id, chapter_id, number, title, volume,
                     language, upload_date, url, first_seen_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                source_id,
                manga_id,
                chapter.id,
                number,
                chapter.title,
                volume,
                chapter.language,
                chapter.upload_date,
                chapter.url,
                first_seen
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    for existing_id in &existing {
        if !fetched_set.contains(existing_id.as_str()) {
            sqlx::query!(
                "DELETE FROM cached_chapter
                  WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
                source_id,
                manga_id,
                existing_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    let total = chapters.len() as i32;
    sqlx::query!(
        "UPDATE library_entry SET cached_total_chapters = ?
          WHERE source_id = ? AND manga_id = ?",
        total,
        source_id,
        manga_id
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(new_count)
}

pub async fn mark_checked(pool: &SqlitePool, source_id: &str, manga_id: &str) -> ServiceResult<()> {
    let now = now();
    sqlx::query!(
        "UPDATE library_entry SET last_checked_at = ?
          WHERE source_id = ? AND manga_id = ?",
        now,
        source_id,
        manga_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn clear_updates(pool: &SqlitePool) -> ServiceResult<()> {
    let now = now();
    sqlx::query!("UPDATE library_entry SET updates_cleared_at = ?", now)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn entries_to_refresh(
    pool: &SqlitePool,
    scope: &RefreshScope,
    force: bool,
) -> ServiceResult<Vec<RefreshTarget>> {
    let pairs = resolve_scope(pool, scope).await?;
    let cutoff = now() - Duration::hours(THROTTLE_HOURS);

    // A category's skip only applies to the sweep over the whole library. Any
    // other scope names its targets, and refusing to check something the user
    // just pointed at would read as the button being broken.
    let scope_kind = matches!(scope, RefreshScope::All);

    let mut targets = Vec::new();
    for (source_id, manga_id) in pairs {
        let row = sqlx::query!(
            r#"SELECT m.title,
                      le.last_checked_at AS "last_checked_at: DateTime<Utc>",
                      COALESCE(sp.enabled, 1) AS "enabled!: i64",
                      COALESCE(sp.skip_updates, 0) AS "skip_updates!: i64"
                 FROM library_entry le
                 JOIN manga m ON m.source_id = le.source_id AND m.manga_id = le.manga_id
                 LEFT JOIN source_preference sp ON sp.source_id = le.source_id
                WHERE le.source_id = ? AND le.manga_id = ?"#,
            source_id,
            manga_id
        )
        .fetch_optional(pool)
        .await?;

        let Some(row) = row else {
            continue;
        };

        if row.enabled == 0 || row.skip_updates != 0 {
            continue;
        }

        if muted_by_category(pool, &scope_kind, &source_id, &manga_id).await? {
            continue;
        }

        if !force
            && let Some(last) = row.last_checked_at
            && last > cutoff
        {
            continue;
        }

        targets.push(RefreshTarget {
            source_id,
            manga_id,
            title: row.title,
        });
    }

    Ok(targets)
}

async fn muted_by_category(
    pool: &SqlitePool,
    applies: &bool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<bool> {
    if !applies {
        return Ok(false);
    }

    let row = sqlx::query!(
        r#"SELECT COUNT(*) AS "total!: i64",
                  COALESCE(SUM(c.skip_updates), 0) AS "muted!: i64"
             FROM library_entry_category lec
             JOIN category c ON c.id = lec.category_id
            WHERE lec.source_id = ? AND lec.manga_id = ?"#,
        source_id,
        manga_id
    )
    .fetch_one(pool)
    .await?;

    Ok(row.total > 0 && row.muted == row.total)
}

async fn resolve_scope(
    pool: &SqlitePool,
    scope: &RefreshScope,
) -> ServiceResult<Vec<(String, String)>> {
    match scope {
        RefreshScope::All => {
            let rows = sqlx::query!("SELECT source_id, manga_id FROM library_entry")
                .fetch_all(pool)
                .await?;
            Ok(rows
                .into_iter()
                .map(|r| (r.source_id, r.manga_id))
                .collect())
        }
        RefreshScope::Category { id } => {
            let rows = sqlx::query!(
                "SELECT source_id, manga_id FROM library_entry_category WHERE category_id = ?",
                id
            )
            .fetch_all(pool)
            .await?;
            Ok(rows
                .into_iter()
                .map(|r| (r.source_id, r.manga_id))
                .collect())
        }
        RefreshScope::Entries { entries } => Ok(entries
            .iter()
            .map(|e| (e.source_id.clone(), e.manga_id.clone()))
            .collect()),
    }
}

pub async fn library_updates(pool: &SqlitePool, limit: i64) -> ServiceResult<Vec<LibraryUpdate>> {
    let rows = sqlx::query!(
        r#"SELECT cc.source_id, cc.manga_id, m.title, m.cover_url,
                  cc.chapter_id, cc.title AS chapter_title,
                  cc.number AS "number: f64",
                  cc.first_seen_at AS "first_seen_at: DateTime<Utc>"
             FROM cached_chapter cc
             JOIN library_entry le
               ON le.source_id = cc.source_id AND le.manga_id = cc.manga_id
             JOIN manga m
               ON m.source_id = cc.source_id AND m.manga_id = cc.manga_id
            WHERE cc.first_seen_at > le.added_at
              AND (le.updates_cleared_at IS NULL
                   OR cc.first_seen_at > le.updates_cleared_at)
              AND NOT EXISTS (
                  SELECT 1 FROM read_chapter rc
                   WHERE rc.source_id = cc.source_id
                     AND rc.manga_id = cc.manga_id
                     AND rc.chapter_id = cc.chapter_id)
              AND NOT EXISTS (
                  SELECT 1 FROM library_entry_category lec
                    JOIN category c ON c.id = lec.category_id
                   WHERE lec.source_id = cc.source_id
                     AND lec.manga_id = cc.manga_id
                     AND (c.hidden = 1 OR c.locked = 1))
            ORDER BY cc.first_seen_at DESC, cc.number DESC"#
    )
    .fetch_all(pool)
    .await?;

    let mut updates: Vec<LibraryUpdate> = Vec::new();

    for row in rows {
        if let Some(existing) = updates
            .iter_mut()
            .find(|u| u.source_id == row.source_id && u.manga_id == row.manga_id)
        {
            existing.new_count += 1;
            continue;
        }

        if updates.len() as i64 >= limit {
            continue;
        }

        updates.push(LibraryUpdate {
            source_id: row.source_id,
            manga_id: row.manga_id,
            title: row.title,
            cover_url: row.cover_url,
            new_count: 1,
            latest_chapter_id: row.chapter_id,
            latest_chapter_title: row.chapter_title,
            latest_number: row.number,
            found_at: row.first_seen_at,
        });
    }

    Ok(updates)
}
