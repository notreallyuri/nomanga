use crate::cache::manga::{upsert_manga, upsert_manga_listing};
use crate::error::{ServiceError, ServiceResult};
use crate::now;
use chrono::{DateTime, Utc};
use nomanga_core::data::manga::{Manga, MangaSimple};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItem {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub added_at: DateTime<Utc>,
    pub cached_total_chapters: i32,
    pub read_chapters: i32,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryRef {
    pub source_id: String,
    pub manga_id: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CategoryFilter {
    #[default]
    All,
    Uncategorized,
    Category {
        id: String,
    },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LibrarySearchField {
    Title,
    Author,
    Artist,
    Tag,
    Description,
}

impl LibrarySearchField {
    fn as_str(self) -> &'static str {
        match self {
            Self::Title => "title",
            Self::Author => "author",
            Self::Artist => "artist",
            Self::Tag => "tag",
            Self::Description => "description",
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarySearch {
    pub field: LibrarySearchField,
    pub query: String,
}

/// The query is matched literally — a title with a `%` in it is searched for,
/// not treated as a wildcard.
fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// `total_chapters` is what the caller already knows about the series, so an
/// entry added from a screen that just listed its chapters shows an unread
/// count immediately instead of waiting for the next refresh run.
async fn insert_entry<'e, E>(
    executor: E,
    source_id: &str,
    manga_id: &str,
    total_chapters: Option<i32>,
) -> ServiceResult<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let added_at = now();

    sqlx::query!(
        "INSERT INTO library_entry (source_id, manga_id, added_at, cached_total_chapters)
         VALUES (?, ?, ?, COALESCE(?, 0))
         ON CONFLICT (source_id, manga_id) DO NOTHING",
        source_id,
        manga_id,
        added_at,
        total_chapters
    )
    .execute(executor)
    .await?;

    Ok(())
}

async fn assign_default_category<'e, E>(
    executor: E,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    // A category picked for this source wins over the library-wide default. A
    // stale id (its category was deleted) falls through to the default.
    sqlx::query!(
        "INSERT INTO library_entry_category (source_id, manga_id, category_id)
         SELECT ?, ?, c.id FROM category c
          WHERE c.id = COALESCE(
                    (SELECT sp.default_category_id FROM source_preference sp
                      WHERE sp.source_id = ?
                        AND sp.default_category_id IN (SELECT id FROM category)),
                    (SELECT id FROM category WHERE is_default = 1))
         ON CONFLICT DO NOTHING",
        source_id,
        manga_id,
        source_id
    )
    .execute(executor)
    .await?;

    Ok(())
}

pub async fn add_listing_to_library(
    pool: &SqlitePool,
    source_id: &str,
    item: &MangaSimple,
) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;
    upsert_manga_listing(&mut *tx, source_id, item).await?;
    insert_entry(&mut *tx, source_id, &item.id, None).await?;
    assign_default_category(&mut *tx, source_id, &item.id).await?;
    tx.commit().await?;

    Ok(())
}

pub async fn add_manga_to_library(
    pool: &SqlitePool,
    source_id: &str,
    manga: &Manga,
    total_chapters: Option<i32>,
) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;
    upsert_manga(&mut *tx, source_id, manga).await?;
    insert_entry(&mut *tx, source_id, &manga.id, total_chapters).await?;
    assign_default_category(&mut *tx, source_id, &manga.id).await?;
    tx.commit().await?;

    Ok(())
}

pub async fn add_to_library(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    total_chapters: Option<i32>,
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

    let mut tx = pool.begin().await?;
    insert_entry(&mut *tx, source_id, manga_id, total_chapters).await?;
    assign_default_category(&mut *tx, source_id, manga_id).await?;
    tx.commit().await?;

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

pub async fn list_library(
    pool: &SqlitePool,
    filter: &CategoryFilter,
    search: Option<&LibrarySearch>,
) -> ServiceResult<Vec<LibraryItem>> {
    let (mode, category_id) = match filter {
        CategoryFilter::All => ("all", String::new()),
        CategoryFilter::Uncategorized => ("none", String::new()),
        CategoryFilter::Category { id } => ("category", id.clone()),
    };

    // An empty field short-circuits the whole search branch, so the unfiltered
    // listing keeps its original plan.
    let (field, pattern) = match search.filter(|s| !s.query.trim().is_empty()) {
        Some(s) => (
            s.field.as_str(),
            format!("%{}%", escape_like(s.query.trim())),
        ),
        None => ("", String::new()),
    };

    let mut rows = sqlx::query_as!(
        LibraryItem,
        r#"SELECT le.source_id, le.manga_id, m.title, m.cover_url,
                  le.added_at AS "added_at: DateTime<Utc>",
                  le.cached_total_chapters AS "cached_total_chapters: i32",
                  (SELECT COUNT(*) FROM read_chapter rc
                    WHERE rc.source_id = le.source_id
                      AND rc.manga_id = le.manga_id) AS "read_chapters: i32"
           FROM library_entry le
           JOIN manga m ON m.source_id = le.source_id AND m.manga_id = le.manga_id
           WHERE CASE ?
               WHEN 'all' THEN NOT EXISTS (
                   SELECT 1 FROM library_entry_category lec
                     JOIN category c ON c.id = lec.category_id
                    WHERE lec.source_id = le.source_id AND lec.manga_id = le.manga_id
                      AND (c.hidden = 1 OR c.locked = 1))
               WHEN 'none' THEN NOT EXISTS (
                   SELECT 1 FROM library_entry_category lec
                    WHERE lec.source_id = le.source_id AND lec.manga_id = le.manga_id)
               ELSE EXISTS (
                   SELECT 1 FROM library_entry_category lec
                    WHERE lec.source_id = le.source_id AND lec.manga_id = le.manga_id
                      AND lec.category_id = ?)
           END
             AND (? = '' OR CASE ?
                 WHEN 'title' THEN m.title LIKE ? ESCAPE '\'
                 WHEN 'description' THEN m.description LIKE ? ESCAPE '\'
                 WHEN 'author' THEN EXISTS (
                     SELECT 1 FROM json_each(m.authors) WHERE value LIKE ? ESCAPE '\')
                 WHEN 'artist' THEN EXISTS (
                     SELECT 1 FROM json_each(m.artists) WHERE value LIKE ? ESCAPE '\')
                 WHEN 'tag' THEN EXISTS (
                     SELECT 1 FROM json_each(m.tags) WHERE value LIKE ? ESCAPE '\')
             END)
           ORDER BY le.added_at DESC"#,
        mode,
        category_id,
        field,
        field,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern
    )
    .fetch_all(pool)
    .await?;

    if let CategoryFilter::Category { id } = filter {
        let sort = sqlx::query_scalar!("SELECT sort_mode FROM category WHERE id = ?", id)
            .fetch_optional(pool)
            .await?;

        match sort.as_deref() {
            Some("title") => {
                rows.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
            }
            Some("unread") => {
                rows.sort_by_key(|i| std::cmp::Reverse(i.cached_total_chapters - i.read_chapters))
            }
            _ => {}
        }
    }

    Ok(rows)
}
