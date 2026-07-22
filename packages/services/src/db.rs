use crate::error::ServiceResult;
use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn open(path: &str) -> ServiceResult<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(&format!("sqlite:{path}"))?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new().connect_with(opts).await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
pub async fn open_in_memory() -> ServiceResult<SqlitePool> {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")?.foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}
