use super::*;
use crate::db::open_in_memory;
use crate::library::cache_manga;
use nomanga_core::data::manga::{Manga, Status};

fn sample_manga(id: &str) -> Manga {
    Manga {
        id: id.to_owned(),
        title: "Test".to_owned(),
        description: String::new(),
        tags: vec![],
        cover_url: "c.jpg".to_owned(),
        author: vec![],
        artist: vec![],
        status: Status::Ongoing,
        last_updated: String::new(),
        rating: None,
        views: None,
    }
}

#[tokio::test]
async fn read_state_and_bulk() {
    let pool = open_in_memory().await.unwrap();

    assert!(!is_chapter_read(&pool, "s", "m", "c1").await.unwrap());
    mark_chapter_read(&pool, "s", "m", "c1").await.unwrap();
    assert!(is_chapter_read(&pool, "s", "m", "c1").await.unwrap());

    mark_chapter_read(&pool, "s", "m", "c1").await.unwrap();
    assert_eq!(read_count(&pool, "s", "m").await.unwrap(), 1);

    mark_chapters_read(&pool, "s", "m", &["c2", "c3", "c4"])
        .await
        .unwrap();
    assert_eq!(read_count(&pool, "s", "m").await.unwrap(), 4);

    let ids = read_chapters_for_manga(&pool, "s", "m").await.unwrap();
    assert_eq!(ids.len(), 4);

    mark_chapter_unread(&pool, "s", "m", "c1").await.unwrap();
    assert!(!is_chapter_read(&pool, "s", "m", "c1").await.unwrap());
    assert_eq!(read_count(&pool, "s", "m").await.unwrap(), 3);
}

#[tokio::test]
async fn progress_and_finish() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "s", &sample_manga("m")).await.unwrap();

    update_progress(&pool, "s", "m", "c1", 5, false)
        .await
        .unwrap();
    let p = get_progress(&pool, "s", "m").await.unwrap().unwrap();
    assert_eq!(p.last_page, 5);
    assert!(!p.last_chapter_done);
    assert_eq!(read_count(&pool, "s", "m").await.unwrap(), 0); // not read yet

    finish_chapter(&pool, "s", "m", "c1", 20).await.unwrap();
    assert!(is_chapter_read(&pool, "s", "m", "c1").await.unwrap());
    let p = get_progress(&pool, "s", "m").await.unwrap().unwrap();
    assert!(p.last_chapter_done);
    assert_eq!(p.last_page, 20);

    let shelf = continue_reading(&pool, 10).await.unwrap();
    assert_eq!(shelf.len(), 1);
    assert_eq!(shelf[0].title, "Test");
}
