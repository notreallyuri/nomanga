use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::ServiceResult;
use crate::now;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub url: String,
    pub name: String,
    pub added_at: DateTime<Utc>,
    pub last_fetched_at: Option<DateTime<Utc>>,
}

pub async fn list(pool: &SqlitePool) -> ServiceResult<Vec<Repository>> {
    let rows = sqlx::query_as!(
        Repository,
        r#"SELECT url,
                  name,
                  added_at AS "added_at: DateTime<Utc>",
                  last_fetched_at AS "last_fetched_at: DateTime<Utc>"
           FROM extension_repository
           ORDER BY added_at"#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Re-adding a URL keeps its original `added_at` so the list does not reorder,
/// but takes the new name — a repository that renamed itself should show up
/// renamed rather than needing a remove and re-add.
pub async fn add(pool: &SqlitePool, url: &str, name: &str) -> ServiceResult<()> {
    let added_at = now();

    sqlx::query!(
        "INSERT INTO extension_repository (url, name, added_at)
         VALUES (?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET name = excluded.name",
        url,
        name,
        added_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn remove(pool: &SqlitePool, url: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM extension_repository WHERE url = ?", url)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_fetched(pool: &SqlitePool, url: &str, name: &str) -> ServiceResult<()> {
    let fetched_at = now();

    sqlx::query!(
        "UPDATE extension_repository
         SET name = ?, last_fetched_at = ?
         WHERE url = ?",
        name,
        fetched_at,
        url
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[tokio::test]
    async fn add_is_idempotent_and_refreshes_the_name() {
        let pool = open_in_memory().await.unwrap();

        add(&pool, "https://example.org/index.json", "Example")
            .await
            .unwrap();
        let first = list(&pool).await.unwrap();
        assert_eq!(first.len(), 1);
        assert!(first[0].last_fetched_at.is_none());

        add(&pool, "https://example.org/index.json", "Renamed")
            .await
            .unwrap();
        let second = list(&pool).await.unwrap();
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].name, "Renamed");
        assert_eq!(second[0].added_at, first[0].added_at);

        mark_fetched(&pool, "https://example.org/index.json", "Example")
            .await
            .unwrap();
        let third = list(&pool).await.unwrap();
        assert_eq!(third[0].name, "Example");
        assert!(third[0].last_fetched_at.is_some());

        remove(&pool, "https://example.org/index.json")
            .await
            .unwrap();
        assert!(list(&pool).await.unwrap().is_empty());
    }
}
