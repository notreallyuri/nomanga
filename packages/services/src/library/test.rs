use super::*;
use crate::db::open_in_memory;
use nomanga_core::data::manga::Manga;

fn sample_manga(_source: &str, id: &str) -> Manga {
    Manga {
        id: id.to_owned(),
        title: "Test Manga".to_owned(),
        description: "desc".to_owned(),
        tags: vec![],
        cover_url: "https://example.com/c.jpg".to_owned(),
        author: vec!["Author".to_owned()],
        artist: vec![],
        status: Status::Ongoing,
        last_updated: String::new(),
        rating: None,
        views: None,
    }
}

#[tokio::test]
async fn add_requires_cache_then_lists() {
    let pool = open_in_memory().await.unwrap();

    let err = add_to_library(&pool, "src", "m1").await.unwrap_err();
    assert!(matches!(err, ServiceError::MangaNotCached { .. }));

    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1").await.unwrap();

    assert!(is_in_library(&pool, "src", "m1").await.unwrap());
    let lib = list_library(&pool).await.unwrap();
    assert_eq!(lib.len(), 1);
    assert_eq!(lib[0].title, "Test Manga");

    add_to_library(&pool, "src", "m1").await.unwrap();
    assert_eq!(list_library(&pool).await.unwrap().len(), 1);

    remove_from_library(&pool, "src", "m1").await.unwrap();
    assert!(!is_in_library(&pool, "src", "m1").await.unwrap());
}

#[tokio::test]
async fn categories_and_membership() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1").await.unwrap();

    let cat = create_category(&pool, "Favorites").await.unwrap();
    assign_category(&pool, "src", "m1", &cat).await.unwrap();

    let in_cat = list_library_by_category(&pool, &cat).await.unwrap();
    assert_eq!(in_cat.len(), 1);

    remove_from_library(&pool, "src", "m1").await.unwrap();
    assert_eq!(
        list_library_by_category(&pool, &cat).await.unwrap().len(),
        0
    );
}
