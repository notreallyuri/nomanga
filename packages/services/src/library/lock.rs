use crate::error::ServiceResult;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core};
use argon2::Argon2;
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn has_password(pool: &SqlitePool) -> ServiceResult<bool> {
    let row = sqlx::query_scalar!("SELECT password_hash FROM library_lock WHERE id = 1")
        .fetch_optional(pool)
        .await?;

    Ok(row.is_some())
}

pub async fn verify_password(pool: &SqlitePool, password: &str) -> ServiceResult<bool> {
    let Some(stored) = sqlx::query_scalar!("SELECT password_hash FROM library_lock WHERE id = 1")
        .fetch_optional(pool)
        .await?
    else {
        return Ok(false);
    };

    let Ok(parsed) = PasswordHash::new(&stored) else {
        return Ok(false);
    };

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub async fn set_password(
    pool: &SqlitePool,
    current: Option<&str>,
    new: &str,
) -> ServiceResult<()> {
    if has_password(pool).await? {
        let ok = match current {
            Some(current) => verify_password(pool, current).await?,
            None => false,
        };

        if !ok {
            return Err(crate::error::ServiceError::LibraryLockPassword);
        }
    }

    let salt = SaltString::generate(&mut rand_core::OsRng);
    let hash = Argon2::default()
        .hash_password(new.as_bytes(), &salt)
        .map_err(|e| crate::error::ServiceError::LibraryLockHash(e.to_string()))?
        .to_string();

    let now = Utc::now().to_rfc3339();

    sqlx::query!(
        "INSERT INTO library_lock (id, password_hash, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
             password_hash = excluded.password_hash,
             updated_at = excluded.updated_at",
        hash,
        now
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn clear_password(pool: &SqlitePool) -> ServiceResult<()> {
    let mut tx = pool.begin().await?;

    sqlx::query!("DELETE FROM library_lock WHERE id = 1")
        .execute(&mut *tx)
        .await?;

    sqlx::query!("UPDATE category SET locked = 0 WHERE locked = 1")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::library::categories;

    #[tokio::test]
    async fn set_verify_and_reset() {
        let pool = open_in_memory().await.unwrap();

        assert!(!has_password(&pool).await.unwrap());
        assert!(!verify_password(&pool, "hunter2").await.unwrap());

        set_password(&pool, None, "hunter2").await.unwrap();
        assert!(has_password(&pool).await.unwrap());
        assert!(verify_password(&pool, "hunter2").await.unwrap());
        assert!(!verify_password(&pool, "wrong").await.unwrap());

        // Changing without the current password is refused.
        assert!(set_password(&pool, None, "next").await.is_err());
        assert!(set_password(&pool, Some("wrong"), "next").await.is_err());
        set_password(&pool, Some("hunter2"), "next").await.unwrap();
        assert!(verify_password(&pool, "next").await.unwrap());
    }

    #[tokio::test]
    async fn reset_unlocks_categories() {
        let pool = open_in_memory().await.unwrap();

        let category = categories::create_category(&pool, "Stash").await.unwrap();
        set_password(&pool, None, "hunter2").await.unwrap();

        categories::update_category_options(
            &pool,
            &category.id,
            &categories::CategoryOptions {
                hidden: false,
                locked: true,
                is_default: false,
                skip_updates: false,
                sort_mode: categories::CategorySort::Added,
                color: None,
                icon: None,
            },
        )
        .await
        .unwrap();

        clear_password(&pool).await.unwrap();

        assert!(!has_password(&pool).await.unwrap());
        let listed = categories::list_categories(&pool).await.unwrap();
        assert!(listed.iter().all(|c| !c.locked));
    }
}
