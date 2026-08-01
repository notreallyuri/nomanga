use crate::error::{ServiceError, ServiceResult};
use crate::library::entries::EntryRef;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CategorySort {
    Added,
    Title,
    Unread,
}

impl CategorySort {
    fn as_str(self) -> &'static str {
        match self {
            Self::Added => "added",
            Self::Title => "title",
            Self::Unread => "unread",
        }
    }

    fn from_db(value: &str) -> Self {
        match value {
            "title" => Self::Title,
            "unread" => Self::Unread,
            _ => Self::Added,
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub hidden: bool,
    pub locked: bool,
    pub is_default: bool,
    pub skip_updates: bool,
    pub sort_mode: CategorySort,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryOptions {
    pub hidden: bool,
    pub locked: bool,
    pub is_default: bool,
    pub skip_updates: bool,
    pub sort_mode: CategorySort,
    pub color: Option<String>,
    pub icon: Option<String>,
}

pub async fn create_category(pool: &SqlitePool, name: &str) -> ServiceResult<Category> {
    let id = uuid::Uuid::new_v4().to_string();

    let sort_order = sqlx::query_scalar!(
        r#"SELECT COALESCE(MAX(sort_order) + 1, 0) AS "next: i32" FROM category"#
    )
    .fetch_one(pool)
    .await?;

    sqlx::query!(
        "INSERT INTO category (id, name, sort_order) VALUES (?, ?, ?)",
        id,
        name,
        sort_order
    )
    .execute(pool)
    .await
    .map_err(|e| ServiceError::category_name(name, e))?;

    Ok(Category {
        id,
        name: name.to_owned(),
        sort_order,
        hidden: false,
        locked: false,
        is_default: false,
        skip_updates: false,
        sort_mode: CategorySort::Added,
        color: None,
        icon: None,
    })
}

pub async fn update_category_options(
    pool: &SqlitePool,
    category_id: &str,
    options: &CategoryOptions,
) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;

    if options.is_default {
        sqlx::query!(
            "UPDATE category SET is_default = 0 WHERE id != ?",
            category_id
        )
        .execute(&mut *tx)
        .await?;
    }

    let sort_mode = options.sort_mode.as_str();

    let result = sqlx::query!(
        "UPDATE category
            SET hidden = ?, locked = ?, is_default = ?, skip_updates = ?,
                sort_mode = ?, color = ?, icon = ?
          WHERE id = ?",
        options.hidden,
        options.locked,
        options.is_default,
        options.skip_updates,
        sort_mode,
        options.color,
        options.icon,
        category_id
    )
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ServiceError::CategoryNotFound {
            id: category_id.to_owned(),
        });
    }

    tx.commit().await?;

    Ok(())
}

pub async fn rename_category(
    pool: &SqlitePool,
    category_id: &str,
    name: &str,
) -> ServiceResult<()> {
    let result = sqlx::query!(
        "UPDATE category SET name = ? WHERE id = ?",
        name,
        category_id
    )
    .execute(pool)
    .await
    .map_err(|e| ServiceError::category_name(name, e))?;

    if result.rows_affected() == 0 {
        return Err(ServiceError::CategoryNotFound {
            id: category_id.to_owned(),
        });
    }

    Ok(())
}

pub async fn reorder_categories(pool: &SqlitePool, category_ids: &[&str]) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;

    for (index, id) in category_ids.iter().enumerate() {
        let sort_order = index as i32;

        sqlx::query!(
            "UPDATE category SET sort_order = ? WHERE id = ?",
            sort_order,
            id
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn delete_category(pool: &SqlitePool, category_id: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM category WHERE id = ?", category_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn list_categories(pool: &SqlitePool) -> ServiceResult<Vec<Category>> {
    let rows = sqlx::query!(
        r#"SELECT id, name, sort_order AS "sort_order: i32",
                  hidden AS "hidden: bool", locked AS "locked: bool",
                  is_default AS "is_default: bool",
                  skip_updates AS "skip_updates: bool", sort_mode, color, icon
             FROM category ORDER BY sort_order, name"#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Category {
            id: r.id,
            name: r.name,
            sort_order: r.sort_order,
            hidden: r.hidden,
            locked: r.locked,
            is_default: r.is_default,
            skip_updates: r.skip_updates,
            sort_mode: CategorySort::from_db(&r.sort_mode),
            color: r.color,
            icon: r.icon,
        })
        .collect())
}

pub async fn assign_category(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    category_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "INSERT INTO library_entry_category (source_id, manga_id, category_id)
         VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING",
        source_id,
        manga_id,
        category_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn unassign_category(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    category_id: &str,
) -> ServiceResult<()> {
    sqlx::query!(
        "DELETE FROM library_entry_category
         WHERE source_id = ? AND manga_id = ? AND category_id = ?",
        source_id,
        manga_id,
        category_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn categories_for_entry(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<Vec<String>> {
    let ids = sqlx::query_scalar!(
        "SELECT category_id FROM library_entry_category
         WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_all(pool)
    .await?;

    Ok(ids)
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryCount {
    pub category_id: String,
    pub count: i32,
}

pub async fn category_counts_for_entries(
    pool: &SqlitePool,
    entries: &[EntryRef],
) -> ServiceResult<Vec<CategoryCount>> {
    let mut counts: HashMap<String, i32> = HashMap::new();

    for entry in entries {
        let ids = categories_for_entry(pool, &entry.source_id, &entry.manga_id).await?;
        for id in ids {
            *counts.entry(id).or_default() += 1;
        }
    }

    Ok(counts
        .into_iter()
        .map(|(category_id, count)| CategoryCount { category_id, count })
        .collect())
}

pub async fn bulk_update_categories(
    pool: &SqlitePool,
    entries: &[EntryRef],
    add: &[&str],
    remove: &[&str],
) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;

    for entry in entries {
        for category_id in add {
            sqlx::query!(
                "INSERT INTO library_entry_category (source_id, manga_id, category_id)
                 VALUES (?, ?, ?)
                 ON CONFLICT DO NOTHING",
                entry.source_id,
                entry.manga_id,
                category_id
            )
            .execute(&mut *tx)
            .await?;
        }

        for category_id in remove {
            sqlx::query!(
                "DELETE FROM library_entry_category
                 WHERE source_id = ? AND manga_id = ? AND category_id = ?",
                entry.source_id,
                entry.manga_id,
                category_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

pub async fn set_entry_categories(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    category_ids: &[&str],
) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;

    sqlx::query!(
        "DELETE FROM library_entry_category WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .execute(&mut *tx)
    .await?;

    for category_id in category_ids {
        sqlx::query!(
            "INSERT INTO library_entry_category (source_id, manga_id, category_id)
             VALUES (?, ?, ?)
             ON CONFLICT DO NOTHING",
            source_id,
            manga_id,
            category_id
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
