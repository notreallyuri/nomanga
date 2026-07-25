use crate::error::ServiceResult;
use crate::now;
use chrono::{DateTime, Duration, Utc};
use nomanga_core::extension::filter::Filter;
use sqlx::SqlitePool;

pub const KIND_FILTERS: &str = "filters";

pub fn default_ttl() -> Duration {
    Duration::hours(24)
}

pub async fn get(
    pool: &SqlitePool,
    source_id: &str,
    kind: &str,
    source_version: &str,
    max_age: Duration,
) -> ServiceResult<Option<String>> {
    let row = sqlx::query!(
        r#"SELECT payload, source_version,
                  cached_at AS "cached_at: DateTime<Utc>"
           FROM source_cache
           WHERE source_id = ? AND kind = ?"#,
        source_id,
        kind
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.and_then(|r| {
        let fresh = r.source_version == source_version && now() - r.cached_at < max_age;
        fresh.then_some(r.payload)
    }))
}

pub async fn put(
    pool: &SqlitePool,
    source_id: &str,
    kind: &str,
    payload: &str,
    source_version: &str,
) -> ServiceResult<()> {
    let cached_at = now();

    sqlx::query!(
        "INSERT INTO source_cache (source_id, kind, payload, source_version, cached_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (source_id, kind) DO UPDATE SET
             payload = excluded.payload,
             source_version = excluded.source_version,
             cached_at = excluded.cached_at",
        source_id,
        kind,
        payload,
        source_version,
        cached_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn invalidate(pool: &SqlitePool, source_id: &str, kind: &str) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM source_cache WHERE source_id = ? AND kind = ?",
        source_id,
        kind
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn clear(pool: &SqlitePool, source_id: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM source_cache WHERE source_id = ?", source_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_filters(
    pool: &SqlitePool,
    source_id: &str,
    source_version: &str,
    max_age: Duration,
) -> ServiceResult<Option<Vec<Filter>>> {
    match get(pool, source_id, KIND_FILTERS, source_version, max_age).await? {
        Some(payload) => Ok(Some(serde_json::from_str(&payload)?)),
        None => Ok(None),
    }
}

pub async fn set_filters(
    pool: &SqlitePool,
    source_id: &str,
    filters: &[Filter],
    source_version: &str,
) -> ServiceResult<()> {
    let payload = serde_json::to_string(filters)?;
    put(pool, source_id, KIND_FILTERS, &payload, source_version).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[tokio::test]
    async fn respects_version_and_ttl() {
        let pool = open_in_memory().await.unwrap();

        assert!(
            get(&pool, "src", KIND_FILTERS, "1.0.0", default_ttl())
                .await
                .unwrap()
                .is_none()
        );

        put(&pool, "src", KIND_FILTERS, "[]", "1.0.0")
            .await
            .unwrap();

        assert_eq!(
            get(&pool, "src", KIND_FILTERS, "1.0.0", default_ttl())
                .await
                .unwrap()
                .as_deref(),
            Some("[]")
        );

        assert!(
            get(&pool, "src", KIND_FILTERS, "2.0.0", default_ttl())
                .await
                .unwrap()
                .is_none()
        );

        assert!(
            get(&pool, "src", KIND_FILTERS, "1.0.0", Duration::zero())
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn clear_drops_all_kinds() {
        let pool = open_in_memory().await.unwrap();

        put(&pool, "src", KIND_FILTERS, "[]", "1").await.unwrap();
        put(&pool, "src", "homepage", "{}", "1").await.unwrap();

        clear(&pool, "src").await.unwrap();

        assert!(
            get(&pool, "src", KIND_FILTERS, "1", default_ttl())
                .await
                .unwrap()
                .is_none()
        );
    }
}
