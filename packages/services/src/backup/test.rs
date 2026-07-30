use super::*;
use crate::db::open_in_memory;
use crate::error::ServiceError;
use crate::settings::Settings;
use sqlx::SqlitePool;

async fn seed(pool: &SqlitePool, manga_id: &str, progress_at: &str) {
    sqlx::query!(
        "INSERT INTO manga (source_id, manga_id, title, cover_url, cached_at)
         VALUES ('src', ?, 'Title', 'https://c/x.jpg', '2026-01-01T00:00:00Z')",
        manga_id
    )
    .execute(pool)
    .await
    .unwrap();

    sqlx::query!(
        "INSERT INTO library_entry (source_id, manga_id, added_at)
         VALUES ('src', ?, '2026-01-01T00:00:00Z')",
        manga_id
    )
    .execute(pool)
    .await
    .unwrap();

    sqlx::query!(
        "INSERT INTO read_progress (source_id, manga_id, last_chapter_id, last_page,
                                    last_chapter_done, updated_at)
         VALUES ('src', ?, 'c5', 3, 0, ?)",
        manga_id,
        progress_at
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn snapshot(pool: &SqlitePool) -> Backup {
    export(pool, &Settings::default(), "0.1.0", vec![])
        .await
        .unwrap()
}

fn tempfile(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("nomanga-backup-{}-{name}", uuid::Uuid::new_v4()))
}

#[tokio::test]
async fn round_trips_through_a_gzipped_file() {
    let pool = open_in_memory().await.unwrap();
    seed(&pool, "m1", "2026-01-02T00:00:00Z").await;

    let path = tempfile("a.backup");
    write_file(&path, &snapshot(&pool).await).unwrap();
    let restored = read_file(&path).unwrap();

    assert_eq!(restored.version, VERSION);
    assert_eq!(restored.library.len(), 1);
    assert_eq!(restored.manga.len(), 1);
    assert_eq!(restored.manga[0].title, "Title");
}

#[tokio::test]
async fn carries_manga_the_user_read_but_never_added_to_the_library() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-01-01T00:00:00Z").await;
    sqlx::query!(
        "INSERT INTO manga (source_id, manga_id, title, cover_url, cached_at)
         VALUES ('src', 'm2', 'Read Only', 'https://c/y.jpg', '2026-01-01T00:00:00Z')"
    )
    .execute(&source)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO read_chapter (source_id, manga_id, chapter_id, read_at)
         VALUES ('src', 'm2', 'c1', '2026-01-01T00:00:00Z')"
    )
    .execute(&source)
    .await
    .unwrap();

    let backup = snapshot(&source).await;
    assert_eq!(backup.manga.len(), 2);
    assert_eq!(backup.library.len(), 1);

    let target = open_in_memory().await.unwrap();
    import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    let titles: Vec<String> = sqlx::query_scalar!("SELECT title FROM manga ORDER BY manga_id")
        .fetch_all(&target)
        .await
        .unwrap();
    assert_eq!(titles, vec!["Title".to_owned(), "Read Only".to_owned()]);
}

#[tokio::test]
async fn rejects_a_backup_from_a_newer_version() {
    let pool = open_in_memory().await.unwrap();
    let mut backup = snapshot(&pool).await;
    backup.version = VERSION + 1;

    let path = tempfile("future.backup");
    write_file(&path, &backup).unwrap();

    assert!(matches!(
        read_file(&path),
        Err(ServiceError::BackupVersion { .. })
    ));
}

#[tokio::test]
async fn merge_restores_into_an_empty_database() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-01-02T00:00:00Z").await;
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    let report = import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    assert_eq!(report.entries, 1);
    let count = sqlx::query_scalar!("SELECT COUNT(*) FROM library_entry")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn merge_does_not_rewind_further_local_progress() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-01-01T00:00:00Z").await;
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    seed(&target, "m1", "2026-06-01T00:00:00Z").await;
    sqlx::query!("UPDATE read_progress SET last_page = 99")
        .execute(&target)
        .await
        .unwrap();

    import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    let page = sqlx::query_scalar!("SELECT last_page FROM read_progress")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(page, 99, "older backup progress must not overwrite newer local progress");
}

#[tokio::test]
async fn merge_applies_newer_backup_progress() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-06-01T00:00:00Z").await;
    sqlx::query!("UPDATE read_progress SET last_page = 42")
        .execute(&source)
        .await
        .unwrap();
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    seed(&target, "m1", "2026-01-01T00:00:00Z").await;

    import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    let page = sqlx::query_scalar!("SELECT last_page FROM read_progress")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(page, 42);
}

#[tokio::test]
async fn merge_reuses_a_category_with_the_same_name() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-01-01T00:00:00Z").await;
    sqlx::query!("INSERT INTO category (id, name) VALUES ('remote-id', 'Reading')")
        .execute(&source)
        .await
        .unwrap();
    sqlx::query!(
        "INSERT INTO library_entry_category (source_id, manga_id, category_id)
         VALUES ('src', 'm1', 'remote-id')"
    )
    .execute(&source)
    .await
    .unwrap();
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    seed(&target, "m1", "2026-01-01T00:00:00Z").await;
    sqlx::query!("INSERT INTO category (id, name) VALUES ('local-id', 'Reading')")
        .execute(&target)
        .await
        .unwrap();

    let report = import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    assert_eq!(report.categories, 0, "same-named category must not duplicate");
    let names = sqlx::query_scalar!("SELECT COUNT(*) FROM category")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(names, 1);

    // The membership row must be remapped onto the local category id.
    let linked = sqlx::query_scalar!(
        "SELECT category_id FROM library_entry_category WHERE manga_id = 'm1'"
    )
    .fetch_one(&target)
    .await
    .unwrap();
    assert_eq!(linked, "local-id");
}

#[tokio::test]
async fn merge_keeps_the_local_default_category() {
    let source = open_in_memory().await.unwrap();
    sqlx::query!("INSERT INTO category (id, name, is_default) VALUES ('r', 'Remote', 1)")
        .execute(&source)
        .await
        .unwrap();
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    sqlx::query!("INSERT INTO category (id, name, is_default) VALUES ('l', 'Local', 1)")
        .execute(&target)
        .await
        .unwrap();

    import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    let default_id = sqlx::query_scalar!("SELECT id FROM category WHERE is_default = 1")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(default_id, "l");
}

#[tokio::test]
async fn replace_drops_local_entries_absent_from_the_backup() {
    let source = open_in_memory().await.unwrap();
    seed(&source, "m1", "2026-01-01T00:00:00Z").await;
    let backup = snapshot(&source).await;

    let target = open_in_memory().await.unwrap();
    seed(&target, "m2", "2026-01-01T00:00:00Z").await;

    import(&target, &backup, ImportMode::Replace, &[])
        .await
        .unwrap();

    let ids: Vec<String> = sqlx::query_scalar!("SELECT manga_id FROM library_entry")
        .fetch_all(&target)
        .await
        .unwrap();
    assert_eq!(ids, vec!["m1".to_owned()]);
}

#[tokio::test]
async fn carries_repositories_and_leaves_local_ones_alone_on_merge() {
    let source = open_in_memory().await.unwrap();
    crate::extension::repository::add(&source, "https://a.example/index.json", "A")
        .await
        .unwrap();
    let backup = snapshot(&source).await;
    assert_eq!(backup.repositories.len(), 1);

    let target = open_in_memory().await.unwrap();
    crate::extension::repository::add(&target, "https://b.example/index.json", "B")
        .await
        .unwrap();

    import(&target, &backup, ImportMode::Merge, &[])
        .await
        .unwrap();

    let merged = crate::extension::repository::list(&target).await.unwrap();
    let mut urls: Vec<&str> = merged.iter().map(|r| r.url.as_str()).collect();
    urls.sort_unstable();
    assert_eq!(
        urls,
        vec!["https://a.example/index.json", "https://b.example/index.json"]
    );

    import(&target, &backup, ImportMode::Replace, &[])
        .await
        .unwrap();

    let replaced = crate::extension::repository::list(&target).await.unwrap();
    assert_eq!(replaced.len(), 1);
    assert_eq!(replaced[0].url, "https://a.example/index.json");
}

#[tokio::test]
async fn reads_a_backup_written_before_repositories_existed() {
    let pool = open_in_memory().await.unwrap();
    let backup = snapshot(&pool).await;

    let mut json = serde_json::to_value(&backup).unwrap();
    json.as_object_mut().unwrap().remove("repositories");

    let older: Backup = serde_json::from_value(json).unwrap();
    assert!(older.repositories.is_empty());
}

#[tokio::test]
async fn reports_extensions_the_backup_needs_but_this_device_lacks() {
    let pool = open_in_memory().await.unwrap();
    let mut backup = snapshot(&pool).await;
    backup.extensions = vec![
        ExtensionRef { id: "dev.yuri.mainpack".into(), version: "1.0".into() },
        ExtensionRef { id: "dev.yuri.nsfwpack".into(), version: "1.0".into() },
    ];

    let report = import(
        &pool,
        &backup,
        ImportMode::Merge,
        &["dev.yuri.mainpack".to_owned()],
    )
    .await
    .unwrap();

    assert_eq!(report.missing_extensions.len(), 1);
    assert_eq!(report.missing_extensions[0].id, "dev.yuri.nsfwpack");
}
