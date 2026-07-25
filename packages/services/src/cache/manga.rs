use crate::error::ServiceResult;
use crate::now;
use nomanga_core::data::manga::{Manga, MangaSimple, Status};
use sqlx::{Sqlite, SqlitePool};

pub async fn cache_manga(pool: &SqlitePool, source_id: &str, manga: &Manga) -> ServiceResult<()> {
    upsert_manga(pool, source_id, manga).await
}

pub async fn cache_manga_listing(
    pool: &SqlitePool,
    source_id: &str,
    item: &MangaSimple,
) -> ServiceResult<()> {
    upsert_manga_listing(pool, source_id, item).await
}

pub(crate) async fn upsert_manga<'e, E>(
    executor: E,
    source_id: &str,
    manga: &Manga,
) -> ServiceResult<()>
where
    E: sqlx::Executor<'e, Database = Sqlite>,
{
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
    .execute(executor)
    .await?;

    Ok(())
}

pub(crate) async fn upsert_manga_listing<'e, E>(
    executor: E,
    source_id: &str,
    item: &MangaSimple,
) -> ServiceResult<()>
where
    E: sqlx::Executor<'e, Database = Sqlite>,
{
    let description = item.description.clone().unwrap_or_default();
    let cached_at = now();

    sqlx::query!(
        "INSERT INTO manga (source_id, manga_id, title, cover_url, description, cached_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_id, manga_id) DO UPDATE SET
             title = excluded.title,
             cover_url = excluded.cover_url,
             description = CASE
                 WHEN excluded.description = '' THEN manga.description
                 ELSE excluded.description
             END",
        source_id,
        item.id,
        item.title,
        item.cover_url,
        description,
        cached_at,
    )
    .execute(executor)
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
