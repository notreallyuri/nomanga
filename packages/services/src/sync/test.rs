use super::transfer::{KEEP_PER_DEVICE, safe};
use super::*;
use crate::db::open_in_memory;
use crate::error::ServiceError;
use crate::settings::Settings;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

fn tempdir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nomanga-sync-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

async fn seed(pool: &SqlitePool, manga_id: &str, at: &str) {
    sqlx::query!(
        "INSERT INTO manga (source_id, manga_id, title, cover_url, cached_at)
         VALUES ('src', ?, 'Title', 'https://c/x.jpg', ?)",
        manga_id,
        at
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO library_entry (source_id, manga_id, added_at) VALUES ('src', ?, ?)",
        manga_id,
        at
    )
    .execute(pool)
    .await
    .unwrap();
}

fn state_in(folder: &Path) -> SyncState {
    SyncState {
        folder: Some(folder.to_path_buf()),
        ..SyncState::default()
    }
}

#[tokio::test]
async fn push_then_pull_moves_the_library_across() {
    let folder = tempdir();

    let a = open_in_memory().await.unwrap();
    seed(&a, "m1", "2026-01-01T00:00:00Z").await;
    let mut push_state = state_in(&folder);
    push(&a, &Settings::default(), &mut push_state, "0.1.0", vec![])
        .await
        .unwrap();
    assert!(push_state.last_push_at.is_some());

    let b = open_in_memory().await.unwrap();
    let mut pull_state = state_in(&folder);
    let (_, report) = pull(&b, &mut pull_state, &[]).await.unwrap();

    assert_eq!(report.entries, 1);
    assert!(pull_state.last_pull_at.is_some());
}

#[tokio::test]
async fn pull_replaces_rather_than_merges() {
    let folder = tempdir();

    let a = open_in_memory().await.unwrap();
    seed(&a, "m1", "2026-01-01T00:00:00Z").await;
    let mut s = state_in(&folder);
    push(&a, &Settings::default(), &mut s, "0.1.0", vec![])
        .await
        .unwrap();

    let b = open_in_memory().await.unwrap();
    seed(&b, "m2", "2026-01-01T00:00:00Z").await;
    pull(&b, &mut state_in(&folder), &[]).await.unwrap();

    let ids: Vec<String> = sqlx::query_scalar!("SELECT manga_id FROM library_entry")
        .fetch_all(&b)
        .await
        .unwrap();
    assert_eq!(ids, vec!["m1".to_owned()]);
}

#[tokio::test]
async fn flags_local_work_newer_than_the_snapshot() {
    let folder = tempdir();

    let a = open_in_memory().await.unwrap();
    seed(&a, "m1", "2026-01-01T00:00:00Z").await;
    let mut s = state_in(&folder);
    push(&a, &Settings::default(), &mut s, "0.1.0", vec![])
        .await
        .unwrap();

    // Same device, nothing new since the push.
    let quiet = status(&a, &s).await.unwrap();
    assert!(!quiet.local_changes_since_remote);
    assert!(quiet.remote_is_this_device);

    // Reading something after the snapshot must raise the warning.
    sqlx::query!(
        "INSERT INTO read_chapter (source_id, manga_id, chapter_id, read_at)
         VALUES ('src', 'm1', 'c1', '2099-01-01T00:00:00Z')"
    )
    .execute(&a)
    .await
    .unwrap();

    let dirty = status(&a, &s).await.unwrap();
    assert!(
        dirty.local_changes_since_remote,
        "pulling would silently discard the newer local read"
    );
}

#[tokio::test]
async fn recognises_a_snapshot_from_another_device() {
    let folder = tempdir();

    let a = open_in_memory().await.unwrap();
    seed(&a, "m1", "2026-01-01T00:00:00Z").await;
    push(
        &a,
        &Settings::default(),
        &mut state_in(&folder),
        "0.1.0",
        vec![],
    )
    .await
    .unwrap();

    let other = status(&a, &state_in(&folder)).await.unwrap();
    assert!(!other.remote_is_this_device);
}

#[tokio::test]
async fn keeps_only_the_most_recent_snapshots() {
    let folder = tempdir();
    let pool = open_in_memory().await.unwrap();
    let mut s = state_in(&folder);

    for i in 0..KEEP_PER_DEVICE + 3 {
        // The filename carries a whole-second timestamp, so space the
        // pushes out rather than letting them collide.
        let file = format!("nomanga-{}-2026010{i}T000000Z.backup", safe(&s.device_name));
        std::fs::write(folder.join(file), b"x").unwrap();
    }
    push(&pool, &Settings::default(), &mut s, "0.1.0", vec![])
        .await
        .unwrap();

    let count = std::fs::read_dir(&folder)
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(".backup"))
        .count();
    assert_eq!(count, KEEP_PER_DEVICE);
}

#[tokio::test]
async fn refuses_to_run_without_a_folder() {
    let pool = open_in_memory().await.unwrap();
    let mut state = SyncState::default();

    assert!(matches!(
        push(&pool, &Settings::default(), &mut state, "0.1.0", vec![]).await,
        Err(ServiceError::SyncNotConfigured)
    ));
    assert!(matches!(
        pull(&pool, &mut state, &[]).await,
        Err(ServiceError::SyncNotConfigured)
    ));
}

#[tokio::test]
async fn reports_an_empty_folder_rather_than_failing() {
    let pool = open_in_memory().await.unwrap();
    let mut state = state_in(&tempdir());

    assert!(matches!(
        pull(&pool, &mut state, &[]).await,
        Err(ServiceError::SyncNoSnapshot)
    ));
    assert!(status(&pool, &state).await.unwrap().remote_device_name.is_none());
}

#[tokio::test]
async fn post_push_hook_receives_the_folder() {
    let folder = tempdir();
    let marker = folder.join("uploaded.txt");

    let pool = open_in_memory().await.unwrap();
    let mut state = state_in(&folder);
    state.post_push_command = Some(format!("ls {{folder}} > {}", marker.display()));

    push(&pool, &Settings::default(), &mut state, "0.1.0", vec![])
        .await
        .unwrap();

    let listed = std::fs::read_to_string(&marker).unwrap();
    assert!(listed.contains("latest.json"), "hook saw: {listed}");
}

#[tokio::test]
async fn a_failing_upload_is_not_recorded_as_a_push() {
    let folder = tempdir();
    let pool = open_in_memory().await.unwrap();

    let mut state = state_in(&folder);
    state.post_push_command = Some("echo nope >&2; exit 3".into());

    let Err(err) = push(&pool, &Settings::default(), &mut state, "0.1.0", vec![]).await
    else {
        panic!("a failing upload must fail the push");
    };

    assert!(matches!(err, ServiceError::SyncHookFailed { .. }));
    assert!(
        state.last_push_at.is_none(),
        "a snapshot that never reached the remote must not count as pushed"
    );
    assert!(format!("{err}").contains("nope"), "stderr should surface: {err}");
}

#[tokio::test]
async fn a_failing_download_leaves_the_library_untouched() {
    let folder = tempdir();
    let pool = open_in_memory().await.unwrap();
    seed(&pool, "m1", "2026-01-01T00:00:00Z").await;

    let mut state = state_in(&folder);
    state.pre_pull_command = Some("exit 1".into());

    let Err(err) = pull(&pool, &mut state, &[]).await else {
        panic!("a failing download must fail the pull");
    };
    assert!(matches!(err, ServiceError::SyncHookFailed { .. }));

    let count = sqlx::query_scalar!("SELECT COUNT(*) FROM library_entry")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1, "pull must abort before Replace wipes anything");
    assert!(state.last_pull_at.is_none());
}

#[tokio::test]
async fn pre_pull_hook_runs_before_the_manifest_is_read() {
    let source_folder = tempdir();
    let dest_folder = tempdir();

    let a = open_in_memory().await.unwrap();
    seed(&a, "m1", "2026-01-01T00:00:00Z").await;
    push(
        &a,
        &Settings::default(),
        &mut state_in(&source_folder),
        "0.1.0",
        vec![],
    )
    .await
    .unwrap();

    // Stands in for `proton-drive filesystem download`: the folder is empty
    // until the hook populates it.
    let b = open_in_memory().await.unwrap();
    let mut state = state_in(&dest_folder);
    state.pre_pull_command =
        Some(format!("cp {}/* {{folder}}/", source_folder.display()));

    let (_, report) = pull(&b, &mut state, &[]).await.unwrap();
    assert_eq!(report.entries, 1);
}

#[tokio::test]
async fn blank_hooks_are_skipped() {
    let folder = tempdir();
    let pool = open_in_memory().await.unwrap();

    let mut state = state_in(&folder);
    state.post_push_command = Some("   ".into());

    push(&pool, &Settings::default(), &mut state, "0.1.0", vec![])
        .await
        .unwrap();
    assert!(state.last_push_at.is_some());
}

#[tokio::test]
async fn substitutes_every_folder_placeholder() {
    let root = std::env::temp_dir().join(format!("nomanga-ph-{}", uuid::Uuid::new_v4()));
    let folder = root.join("my-sync");
    std::fs::create_dir_all(&folder).unwrap();

    let out = root.join("args.txt");
    let pool = open_in_memory().await.unwrap();

    let mut state = SyncState {
        folder: Some(folder.clone()),
        ..SyncState::default()
    };
    state.post_push_command = Some(format!(
        "echo '{{folder}}|{{folder_name}}|{{folder_parent}}' > {}",
        out.display()
    ));

    push(&pool, &Settings::default(), &mut state, "0.1.0", vec![])
        .await
        .unwrap();

    let line = std::fs::read_to_string(&out).unwrap();
    let parts: Vec<&str> = line.trim().split('|').collect();
    assert_eq!(parts[0], folder.to_string_lossy());
    assert_eq!(parts[1], "my-sync");
    assert_eq!(parts[2], root.to_string_lossy());
}
