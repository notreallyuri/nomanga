use crate::error::ServiceResult;
use crate::now;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct ImageCacheStats {
    pub file_count: u32,
    pub total_bytes: f64,
}

pub fn key(url: &str) -> String {
    let digest = Sha256::digest(url.as_bytes());
    format!("{digest:x}")
}

pub fn path(root: &Path, key: &str) -> PathBuf {
    root.join(&key[..2]).join(key)
}

pub async fn read(
    pool: &SqlitePool,
    root: &Path,
    url: &str,
) -> ServiceResult<Option<(Vec<u8>, String)>> {
    let key = key(url);

    let Some(row) = sqlx::query!("SELECT content_type FROM image_cache WHERE key = ?", key)
        .fetch_optional(pool)
        .await?
    else {
        return Ok(None);
    };

    let file = path(root, &key);

    let bytes = match tokio::fs::read(&file).await {
        Ok(bytes) => bytes,
        Err(_) => {
            forget(pool, &key).await?;
            return Ok(None);
        }
    };

    let accessed_at = now();
    sqlx::query!(
        "UPDATE image_cache SET accessed_at = ? WHERE key = ?",
        accessed_at,
        key
    )
    .execute(pool)
    .await?;

    Ok(Some((bytes, row.content_type)))
}

pub async fn write(
    pool: &SqlitePool,
    root: &Path,
    url: &str,
    content_type: &str,
    bytes: &[u8],
    max_bytes: u64,
) -> ServiceResult<()> {
    let key = key(url);
    let file = path(root, &key);

    if let Some(parent) = file.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let tmp = file.with_extension("tmp");
    tokio::fs::write(&tmp, bytes).await?;
    tokio::fs::rename(&tmp, &file).await?;

    let byte_size = bytes.len() as i64;
    let ts = now();

    sqlx::query!(
        "INSERT INTO image_cache (key, url, content_type, byte_size, created_at, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET
             content_type = excluded.content_type,
             byte_size = excluded.byte_size,
             accessed_at = excluded.accessed_at",
        key,
        url,
        content_type,
        byte_size,
        ts,
        ts
    )
    .execute(pool)
    .await?;

    evict_to(pool, root, max_bytes).await
}

pub async fn stats(pool: &SqlitePool) -> ServiceResult<ImageCacheStats> {
    let row = sqlx::query!(
        r#"SELECT COUNT(*) AS "file_count!: i64",
                  COALESCE(SUM(byte_size), 0) AS "total_bytes!: i64"
           FROM image_cache"#
    )
    .fetch_one(pool)
    .await?;

    Ok(ImageCacheStats {
        file_count: row.file_count as u32,
        total_bytes: row.total_bytes as f64,
    })
}

async fn total_bytes(pool: &SqlitePool) -> ServiceResult<i64> {
    let row = sqlx::query!(
        r#"SELECT COALESCE(SUM(byte_size), 0) AS "total!: i64" FROM image_cache"#
    )
    .fetch_one(pool)
    .await?;

    Ok(row.total)
}

pub async fn evict_to(pool: &SqlitePool, root: &Path, max_bytes: u64) -> ServiceResult<()> {
    let max_bytes = i64::try_from(max_bytes).unwrap_or(i64::MAX);

    let total = total_bytes(pool).await?;
    if total <= max_bytes {
        return Ok(());
    }

    let target = max_bytes / 10 * 9;
    let mut freed = 0_i64;

    let victims = sqlx::query!(
        r#"SELECT key AS "key!: String", byte_size AS "byte_size!: i64"
           FROM image_cache ORDER BY accessed_at ASC"#
    )
    .fetch_all(pool)
    .await?;

    for victim in victims {
        if total - freed <= target {
            break;
        }
        tokio::fs::remove_file(path(root, &victim.key)).await.ok();
        forget(pool, &victim.key).await?;
        freed += victim.byte_size;
    }

    Ok(())
}

pub async fn clear(pool: &SqlitePool, root: &Path) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM image_cache")
        .execute(pool)
        .await?;

    let mut entries = match tokio::fs::read_dir(root).await {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };

    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_dir() {
            tokio::fs::remove_dir_all(entry.path()).await.ok();
        }
    }

    Ok(())
}

async fn forget(pool: &SqlitePool, key: &str) -> ServiceResult<()> {
    sqlx::query!("DELETE FROM image_cache WHERE key = ?", key)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn tempdir() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("nomanga-image-cache-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const NO_LIMIT: u64 = u64::MAX;

    #[tokio::test]
    async fn round_trips_bytes_and_content_type() {
        let pool = open_in_memory().await.unwrap();
        let root = tempdir();

        assert!(
            read(&pool, &root, "https://x/a.jpg")
                .await
                .unwrap()
                .is_none()
        );

        write(
            &pool,
            &root,
            "https://x/a.jpg",
            "image/webp",
            b"hello",
            NO_LIMIT,
        )
        .await
        .unwrap();

        let (bytes, content_type) = read(&pool, &root, "https://x/a.jpg")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(bytes, b"hello");
        assert_eq!(content_type, "image/webp");
    }

    #[tokio::test]
    async fn missing_file_is_a_miss_and_drops_the_row() {
        let pool = open_in_memory().await.unwrap();
        let root = tempdir();

        write(
            &pool,
            &root,
            "https://x/a.jpg",
            "image/jpeg",
            b"hello",
            NO_LIMIT,
        )
        .await
        .unwrap();
        std::fs::remove_file(path(&root, &key("https://x/a.jpg"))).unwrap();

        assert!(
            read(&pool, &root, "https://x/a.jpg")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(stats(&pool).await.unwrap().file_count, 0);
    }

    #[tokio::test]
    async fn eviction_drops_least_recently_read_first() {
        let pool = open_in_memory().await.unwrap();
        let root = tempdir();

        for name in ["a", "b", "c"] {
            write(
                &pool,
                &root,
                &format!("https://x/{name}.jpg"),
                "image/jpeg",
                &[0_u8; 100],
                NO_LIMIT,
            )
            .await
            .unwrap();
        }

        read(&pool, &root, "https://x/a.jpg").await.unwrap();

        evict_to(&pool, &root, 250).await.unwrap();

        assert!(
            read(&pool, &root, "https://x/b.jpg")
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            read(&pool, &root, "https://x/c.jpg")
                .await
                .unwrap()
                .is_some()
        );
        assert!(
            read(&pool, &root, "https://x/a.jpg")
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn clear_empties_rows_and_files() {
        let pool = open_in_memory().await.unwrap();
        let root = tempdir();

        write(
            &pool,
            &root,
            "https://x/a.jpg",
            "image/jpeg",
            b"hello",
            NO_LIMIT,
        )
        .await
        .unwrap();
        clear(&pool, &root).await.unwrap();

        assert_eq!(stats(&pool).await.unwrap(), ImageCacheStats::default());
        assert!(
            read(&pool, &root, "https://x/a.jpg")
                .await
                .unwrap()
                .is_none()
        );
    }
}
