use super::*;
use crate::cache::manga::cache_manga;
use crate::db::open_in_memory;
use crate::error::ServiceError;
use chrono::{DateTime, Utc};
use nomanga_core::data::chapter::Chapter;
use nomanga_core::data::manga::{Manga, MangaSimple, Status};

fn sample_chapter(id: &str, number: f32) -> Chapter {
    Chapter {
        id: id.to_owned(),
        title: format!("Chapter {number}"),
        manga_id: "m1".to_owned(),
        number,
        volume: None,
        language: "en".to_owned(),
        upload_date: String::new(),
        page_count: None,
        scanlator: None,
        url: "https://example.com/ch".to_owned(),
        is_locked: false,
    }
}

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

    let err = add_to_library(&pool, "src", "m1", None).await.unwrap_err();
    assert!(matches!(err, ServiceError::MangaNotCached { .. }));

    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1", None).await.unwrap();

    assert!(is_in_library(&pool, "src", "m1").await.unwrap());
    let lib = list_library(&pool, &CategoryFilter::All, None).await.unwrap();
    assert_eq!(lib.len(), 1);
    assert_eq!(lib[0].title, "Test Manga");

    add_to_library(&pool, "src", "m1", None).await.unwrap();
    assert_eq!(
        list_library(&pool, &CategoryFilter::All, None)
            .await
            .unwrap()
            .len(),
        1
    );

    remove_from_library(&pool, "src", "m1").await.unwrap();
    assert!(!is_in_library(&pool, "src", "m1").await.unwrap());
}

#[tokio::test]
async fn add_listing_caches_without_clobbering_details() {
    let pool = open_in_memory().await.unwrap();

    let listing = MangaSimple {
        id: "m1".to_owned(),
        title: "From Search".to_owned(),
        description: None,
        cover_url: "https://example.com/list.jpg".to_owned(),
    };

    add_listing_to_library(&pool, "src", &listing)
        .await
        .unwrap();

    let lib = list_library(&pool, &CategoryFilter::All, None).await.unwrap();
    assert_eq!(lib.len(), 1);
    assert_eq!(lib[0].title, "From Search");

    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_listing_to_library(&pool, "src", &listing)
        .await
        .unwrap();

    let (description, authors) = sqlx::query!(
        "SELECT description, authors FROM manga WHERE source_id = ? AND manga_id = ?",
        "src",
        "m1"
    )
    .fetch_one(&pool)
    .await
    .map(|r| (r.description, r.authors))
    .unwrap();

    assert_eq!(description, "desc");
    assert_eq!(authors, r#"["Author"]"#);
    assert_eq!(
        list_library(&pool, &CategoryFilter::All, None)
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn add_manga_caches_and_adds() {
    let pool = open_in_memory().await.unwrap();

    add_manga_to_library(&pool, "src", &sample_manga("src", "m1"), None)
        .await
        .unwrap();

    assert!(is_in_library(&pool, "src", "m1").await.unwrap());
    assert_eq!(
        list_library(&pool, &CategoryFilter::All, None).await.unwrap()[0].title,
        "Test Manga"
    );
}

#[tokio::test]
async fn categories_and_membership() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1", None).await.unwrap();

    let favorites = create_category(&pool, "Favorites").await.unwrap();
    let filter = CategoryFilter::Category {
        id: favorites.id.clone(),
    };

    assert_eq!(
        list_library(&pool, &CategoryFilter::Uncategorized, None)
            .await
            .unwrap()
            .len(),
        1
    );

    assign_category(&pool, "src", "m1", &favorites.id)
        .await
        .unwrap();

    assert_eq!(list_library(&pool, &filter, None).await.unwrap().len(), 1);
    assert_eq!(
        list_library(&pool, &CategoryFilter::Uncategorized, None)
            .await
            .unwrap()
            .len(),
        0
    );

    remove_from_library(&pool, "src", "m1").await.unwrap();
    assert_eq!(list_library(&pool, &filter, None).await.unwrap().len(), 0);
}

#[tokio::test]
async fn category_crud() {
    let pool = open_in_memory().await.unwrap();

    let reading = create_category(&pool, "Reading").await.unwrap();
    let done = create_category(&pool, "Done").await.unwrap();

    assert_eq!(reading.sort_order, 0);
    assert_eq!(done.sort_order, 1);

    let err = create_category(&pool, "Reading").await.unwrap_err();
    assert!(matches!(err, ServiceError::CategoryExists { .. }));

    rename_category(&pool, &reading.id, "Currently reading")
        .await
        .unwrap();

    let err = rename_category(&pool, "missing", "Whatever")
        .await
        .unwrap_err();
    assert!(matches!(err, ServiceError::CategoryNotFound { .. }));

    reorder_categories(&pool, &[&done.id, &reading.id])
        .await
        .unwrap();

    let categories = list_categories(&pool).await.unwrap();
    assert_eq!(categories[0].name, "Done");
    assert_eq!(categories[1].name, "Currently reading");

    delete_category(&pool, &done.id).await.unwrap();
    assert_eq!(list_categories(&pool).await.unwrap().len(), 1);
}

#[tokio::test]
async fn entry_categories_are_replaced_wholesale() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1", None).await.unwrap();

    let a = create_category(&pool, "A").await.unwrap();
    let b = create_category(&pool, "B").await.unwrap();

    set_entry_categories(&pool, "src", "m1", &[&a.id, &b.id])
        .await
        .unwrap();
    assert_eq!(
        categories_for_entry(&pool, "src", "m1")
            .await
            .unwrap()
            .len(),
        2
    );

    set_entry_categories(&pool, "src", "m1", &[&b.id])
        .await
        .unwrap();
    assert_eq!(
        categories_for_entry(&pool, "src", "m1").await.unwrap(),
        vec![b.id]
    );

    set_entry_categories(&pool, "src", "m1", &[]).await.unwrap();
    assert!(
        categories_for_entry(&pool, "src", "m1")
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn read_counts_come_back_with_entries() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1", None).await.unwrap();

    let entry = &list_library(&pool, &CategoryFilter::All, None).await.unwrap()[0];
    assert_eq!(entry.read_chapters, 0);
    assert_eq!(entry.cached_total_chapters, 0);

    crate::history::mark_chapters_read(&pool, "src", "m1", &["c1", "c2"])
        .await
        .unwrap();

    let entry = &list_library(&pool, &CategoryFilter::All, None).await.unwrap()[0];
    assert_eq!(entry.read_chapters, 2);
}

#[tokio::test]
async fn updates_exclude_hidden_categories() {
    let pool = open_in_memory().await.unwrap();
    cache_manga(&pool, "src", &sample_manga("src", "m1"))
        .await
        .unwrap();
    add_to_library(&pool, "src", "m1", None).await.unwrap();

    let past = "2000-01-01T00:00:00Z".parse::<DateTime<Utc>>().unwrap();
    sqlx::query!(
        "UPDATE library_entry SET added_at = ? WHERE source_id = ? AND manga_id = ?",
        past,
        "src",
        "m1"
    )
    .execute(&pool)
    .await
    .unwrap();

    sync_chapters(&pool, "src", "m1", &[sample_chapter("c1", 1.0)])
        .await
        .unwrap();
    sync_chapters(
        &pool,
        "src",
        "m1",
        &[sample_chapter("c1", 1.0), sample_chapter("c2", 2.0)],
    )
    .await
    .unwrap();

    assert_eq!(library_updates(&pool, 30).await.unwrap().len(), 1);

    let secret = create_category(&pool, "Secret").await.unwrap();
    update_category_options(
        &pool,
        &secret.id,
        &CategoryOptions {
            hidden: true,
            locked: false,
            is_default: false,
            sort_mode: CategorySort::Added,
            color: None,
            icon: None,
        },
    )
    .await
    .unwrap();
    set_entry_categories(&pool, "src", "m1", &[&secret.id])
        .await
        .unwrap();

    assert_eq!(library_updates(&pool, 30).await.unwrap().len(), 0);
}

#[tokio::test]
async fn searches_by_field_within_the_current_category() {
    use nomanga_core::data::manga::Tag;

    let pool = open_in_memory().await.unwrap();

    let mut first = sample_manga("src", "m1");
    first.title = "Blue Flag".to_owned();
    first.author = vec!["Kaito".to_owned()];
    first.artist = vec!["Kaito".to_owned()];
    first.tags = vec![Tag {
        id: "romance".to_owned(),
        label: "Romance".to_owned(),
    }];

    let mut second = sample_manga("src", "m2");
    second.title = "Red Sail".to_owned();
    second.author = vec!["Someone Else".to_owned()];
    second.tags = vec![Tag {
        id: "action".to_owned(),
        label: "Action".to_owned(),
    }];

    for manga in [&first, &second] {
        cache_manga(&pool, "src", manga).await.unwrap();
        add_to_library(&pool, "src", &manga.id, None).await.unwrap();
    }

    let search = |field, query: &str| LibrarySearch {
        field,
        query: query.to_owned(),
    };

    let found = |field, query: &str| {
        let search = search(field, query);
        let pool = pool.clone();
        async move {
            list_library(&pool, &CategoryFilter::All, Some(&search))
                .await
                .unwrap()
                .into_iter()
                .map(|i| i.manga_id)
                .collect::<Vec<_>>()
        }
    };

    assert_eq!(found(LibrarySearchField::Title, "blue").await, ["m1"]);
    assert_eq!(found(LibrarySearchField::Author, "kaito").await, ["m1"]);
    assert_eq!(found(LibrarySearchField::Artist, "kaito").await, ["m1"]);
    assert_eq!(found(LibrarySearchField::Tag, "roman").await, ["m1"]);
    assert_eq!(found(LibrarySearchField::Tag, "action").await, ["m2"]);
    assert!(found(LibrarySearchField::Title, "nothing").await.is_empty());

    // Wildcards in the query are matched literally, not as patterns.
    assert!(found(LibrarySearchField::Title, "%").await.is_empty());

    // A blank query is not a filter at all.
    let all = list_library(
        &pool,
        &CategoryFilter::All,
        Some(&search(LibrarySearchField::Title, "   ")),
    )
    .await
    .unwrap();
    assert_eq!(all.len(), 2);

    // The search only ever looks inside the category being viewed.
    let category = crate::library::categories::create_category(&pool, "Shelf")
        .await
        .unwrap();
    assign_category(&pool, "src", "m2", &category.id).await.unwrap();

    let filter = CategoryFilter::Category {
        id: category.id.clone(),
    };
    assert!(
        list_library(&pool, &filter, Some(&search(LibrarySearchField::Title, "blue")))
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        list_library(&pool, &filter, Some(&search(LibrarySearchField::Title, "red")))
            .await
            .unwrap()
            .len(),
        1
    );
}
