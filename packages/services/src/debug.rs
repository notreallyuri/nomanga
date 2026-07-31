use crate::error::ServiceResult;
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, Column, Row, SqlitePool, TypeInfo, ValueRef};

/// Browsable tables, as a fixed list. Arbitrary SQL is a footgun in a shipped
/// app even read-only, and every table worth inspecting is known up front.
pub const TABLES: &[&str] = &[
    "manga",
    "library_entry",
    "library_entry_category",
    "category",
    "read_chapter",
    "read_progress",
    "source_preference",
    "source_setting",
    "reader_override",
    "downloaded_chapter",
    "downloaded_page",
    "download_queue",
    "cached_chapter",
    "source_cache",
    "image_cache",
    "_sqlx_migrations",
];

pub const PAGE_SIZE: u32 = 50;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableCount {
    pub name: String,
    pub rows: f64,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TablePage {
    pub name: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    pub total: f64,
    pub page: u32,
    pub page_size: u32,
}

pub fn is_known_table(name: &str) -> bool {
    TABLES.contains(&name)
}

pub async fn table_counts(pool: &SqlitePool) -> ServiceResult<Vec<TableCount>> {
    let mut out = Vec::with_capacity(TABLES.len());

    for name in TABLES {
        // Interpolating a `&'static str` straight out of TABLES — a caller
        // string never reaches this format.
        let rows: i64 = sqlx::query_scalar(AssertSqlSafe(format!("SELECT COUNT(*) FROM {name}")))
            .fetch_one(pool)
            .await
            .unwrap_or(-1);

        out.push(TableCount {
            name: (*name).to_owned(),
            rows: rows as f64,
        });
    }

    Ok(out)
}

pub async fn table_page(pool: &SqlitePool, name: &str, page: u32) -> ServiceResult<TablePage> {
    // Resolve to the entry in TABLES and interpolate *that*, so the value
    // reaching the query is always a compile-time constant.
    let Some(table) = TABLES.iter().find(|t| **t == name) else {
        return Ok(TablePage {
            name: name.to_owned(),
            columns: Vec::new(),
            rows: Vec::new(),
            total: 0.0,
            page: 0,
            page_size: PAGE_SIZE,
        });
    };

    let total: i64 = sqlx::query_scalar(AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
        .fetch_one(pool)
        .await?;

    let offset = page * PAGE_SIZE;
    let fetched = sqlx::query(AssertSqlSafe(format!(
        "SELECT * FROM {table} LIMIT ? OFFSET ?"
    )))
        .bind(PAGE_SIZE)
        .bind(offset)
        .fetch_all(pool)
        .await?;

    let columns = fetched
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|c| c.name().to_owned())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let rows = fetched.iter().map(|row| stringify_row(row)).collect();

    Ok(TablePage {
        name: name.to_owned(),
        columns,
        rows,
        total: total as f64,
        page,
        page_size: PAGE_SIZE,
    })
}

/// SQLite columns are dynamically typed, so each value is coerced to text for
/// display rather than decoded into a concrete Rust type.
fn stringify_row(row: &sqlx::sqlite::SqliteRow) -> Vec<Option<String>> {
    (0..row.len())
        .map(|i| {
            let raw = row.try_get_raw(i).ok()?;
            if raw.is_null() {
                return None;
            }

            match raw.type_info().name() {
                "TEXT" => row.try_get::<String, _>(i).ok(),
                "INTEGER" => row.try_get::<i64, _>(i).ok().map(|v| v.to_string()),
                "REAL" => row.try_get::<f64, _>(i).ok().map(|v| v.to_string()),
                "BLOB" => row
                    .try_get::<Vec<u8>, _>(i)
                    .ok()
                    .map(|b| format!("<{} bytes>", b.len())),
                _ => row.try_get::<String, _>(i).ok(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[tokio::test]
    async fn counts_every_listed_table() {
        let pool = open_in_memory().await.unwrap();
        let counts = table_counts(&pool).await.unwrap();

        assert_eq!(counts.len(), TABLES.len());
        assert!(
            counts.iter().all(|c| c.rows >= 0.0),
            "a -1 means the table is missing from the schema: {counts:?}"
        );
    }

    #[tokio::test]
    async fn pages_rows_and_reports_the_total() {
        let pool = open_in_memory().await.unwrap();

        for i in 0..(PAGE_SIZE + 10) {
            let id = format!("m{i}");
            sqlx::query!(
                "INSERT INTO manga (source_id, manga_id, title, cover_url, cached_at)
                 VALUES ('src', ?, 'T', 'u', '2026-01-01T00:00:00Z')",
                id
            )
            .execute(&pool)
            .await
            .unwrap();
        }

        let first = table_page(&pool, "manga", 0).await.unwrap();
        assert_eq!(first.total, (PAGE_SIZE + 10) as f64);
        assert_eq!(first.rows.len(), PAGE_SIZE as usize);
        assert!(first.columns.contains(&"manga_id".to_owned()));

        let second = table_page(&pool, "manga", 1).await.unwrap();
        assert_eq!(second.rows.len(), 10);
    }

    #[tokio::test]
    async fn refuses_a_table_outside_the_list() {
        let pool = open_in_memory().await.unwrap();

        let page = table_page(&pool, "sqlite_master", 0).await.unwrap();
        assert!(page.rows.is_empty());
        assert!(page.columns.is_empty());

        // The guard is what stops the name reaching the format! above.
        assert!(!is_known_table("manga; DROP TABLE manga"));
    }

    #[tokio::test]
    async fn renders_nulls_and_values_as_text() {
        let pool = open_in_memory().await.unwrap();
        sqlx::query!(
            "INSERT INTO manga (source_id, manga_id, title, cover_url, cached_at)
             VALUES ('src', 'm1', 'T', 'u', '2026-01-01T00:00:00Z')"
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query!(
            "INSERT INTO library_entry (source_id, manga_id, added_at, cached_total_chapters)
             VALUES ('src', 'm1', '2026-01-01T00:00:00Z', 7)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let page = table_page(&pool, "library_entry", 0).await.unwrap();
        let row = &page.rows[0];

        assert!(row.contains(&Some("7".to_owned())), "{row:?}");
        assert!(row.contains(&None), "last_checked_at is null: {row:?}");
    }
}
