use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::ServiceResult;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcePreference {
    pub source_id: String,
    pub enabled: bool,
    pub private: bool,
    pub blur_covers: bool,
    pub skip_updates: bool,
    pub hide_from_search: bool,
    pub default_category_id: Option<String>,
}

impl SourcePreference {
    pub fn default_for(source_id: &str) -> Self {
        Self {
            source_id: source_id.to_owned(),
            enabled: false,
            private: false,
            blur_covers: false,
            skip_updates: false,
            hide_from_search: false,
            default_category_id: None,
        }
    }
}

pub async fn get(pool: &SqlitePool, source_id: &str) -> ServiceResult<SourcePreference> {
    let row = sqlx::query!(
        "SELECT source_id, enabled, private, blur_covers, skip_updates, hide_from_search,
                default_category_id
         FROM source_preference
         WHERE source_id = ?",
        source_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        Some(r) => SourcePreference {
            source_id: r.source_id,
            enabled: r.enabled != 0,
            private: r.private != 0,
            blur_covers: r.blur_covers != 0,
            skip_updates: r.skip_updates != 0,
            hide_from_search: r.hide_from_search != 0,
            default_category_id: r.default_category_id,
        },
        None => SourcePreference::default_for(source_id),
    })
}

pub async fn list(pool: &SqlitePool) -> ServiceResult<Vec<SourcePreference>> {
    let rows = sqlx::query!(
        "SELECT source_id, enabled, private, blur_covers, skip_updates, hide_from_search,
                default_category_id
         FROM source_preference"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| SourcePreference {
            source_id: r.source_id,
            enabled: r.enabled != 0,
            private: r.private != 0,
            blur_covers: r.blur_covers != 0,
            skip_updates: r.skip_updates != 0,
            hide_from_search: r.hide_from_search != 0,
            default_category_id: r.default_category_id,
        })
        .collect())
}

// Only sources with an explicit opt-in row come back, which is what the host
// gates plugin builds on -- a source that has never been switched on is absent
// here and stays uncompiled.
pub async fn enabled_ids(pool: &SqlitePool) -> ServiceResult<std::collections::HashSet<String>> {
    let rows = sqlx::query!("SELECT source_id FROM source_preference WHERE enabled != 0")
        .fetch_all(pool)
        .await?;

    Ok(rows.into_iter().map(|r| r.source_id).collect())
}

pub async fn set(pool: &SqlitePool, pref: &SourcePreference) -> ServiceResult<()> {
    let enabled = pref.enabled as i64;
    let private = pref.private as i64;
    let blur_covers = pref.blur_covers as i64;
    let skip_updates = pref.skip_updates as i64;
    let hide_from_search = pref.hide_from_search as i64;

    sqlx::query!(
        "INSERT INTO source_preference
            (source_id, enabled, private, blur_covers, skip_updates, hide_from_search,
             default_category_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (source_id) DO UPDATE SET
             enabled = excluded.enabled,
             private = excluded.private,
             blur_covers = excluded.blur_covers,
             skip_updates = excluded.skip_updates,
             hide_from_search = excluded.hide_from_search,
             default_category_id = excluded.default_category_id",
        pref.source_id,
        enabled,
        private,
        blur_covers,
        skip_updates,
        hide_from_search,
        pref.default_category_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn remove(pool: &SqlitePool, source_id: &str) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM source_preference WHERE source_id = ?",
        source_id
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
    async fn defaults_then_upsert() {
        let pool = open_in_memory().await.unwrap();

        let pref = get(&pool, "src").await.unwrap();
        assert!(!pref.enabled, "an untouched source stays off until opted into");
        assert!(!pref.private);

        set(
            &pool,
            &SourcePreference {
                source_id: "src".into(),
                enabled: true,
                private: true,
                blur_covers: false,
                skip_updates: false,
                hide_from_search: false,
                default_category_id: None,
            },
        )
        .await
        .unwrap();

        let pref = get(&pool, "src").await.unwrap();
        assert!(pref.private);

        assert_eq!(list(&pool).await.unwrap().len(), 1);
    }
}
