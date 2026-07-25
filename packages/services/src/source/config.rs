use crate::error::ServiceResult;
use sqlx::SqlitePool;
use std::collections::HashMap;

pub async fn config_for(
    pool: &SqlitePool,
    source_id: &str,
) -> ServiceResult<HashMap<String, String>> {
    let rows = sqlx::query!(
        "SELECT key, value FROM source_setting WHERE source_id = ?",
        source_id
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.key, r.value)).collect())
}

pub async fn all_configs(
    pool: &SqlitePool,
) -> ServiceResult<HashMap<String, HashMap<String, String>>> {
    let rows = sqlx::query!("SELECT source_id, key, value FROM source_setting")
        .fetch_all(pool)
        .await?;

    let mut out: HashMap<String, HashMap<String, String>> = HashMap::new();
    for row in rows {
        out.entry(row.source_id)
            .or_default()
            .insert(row.key, row.value);
    }
    Ok(out)
}

pub async fn set(pool: &SqlitePool, source_id: &str, key: &str, value: &str) -> ServiceResult<()> {
    sqlx::query!(
        "INSERT INTO source_setting (source_id, key, value)
         VALUES (?, ?, ?)
         ON CONFLICT (source_id, key) DO UPDATE SET value = excluded.value",
        source_id,
        key,
        value
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_many(
    pool: &SqlitePool,
    source_id: &str,
    values: &HashMap<String, String>,
) -> ServiceResult<()> {
    if values.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    for (key, value) in values {
        sqlx::query!(
            "INSERT INTO source_setting (source_id, key, value)
             VALUES (?, ?, ?)
             ON CONFLICT (source_id, key) DO UPDATE SET value = excluded.value",
            source_id,
            key,
            value
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn clear(pool: &SqlitePool, source_id: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM source_setting WHERE source_id = ?", source_id)
        .execute(pool)
        .await?;
    Ok(())
}
