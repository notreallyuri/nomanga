//! Natomanga is Cloudflare-gated, so its parsers cannot be exercised against
//! the live site the way every other source in this pack was. These tests run
//! them against browser-saved pages in `fixtures/natomanga/` instead.
//!
//! Caveat worth keeping in mind: "save page as" rewrote every `src` to a local
//! path, so anything asserted about image URLs here is only meaningful because
//! the parsers read `data-src` / `onerror` / JSON-LD instead. The detail-page
//! cover is the one field these fixtures cannot prove out end to end.

use super::parser;
use super::util::{chapter_id_from_url, search_slug, slug_from_url};

const LATEST: &str = include_str!("../../../fixtures/natomanga/latest_manga_viewmore.html");
const HOT: &str = include_str!("../../../fixtures/natomanga/hot_manga_viewmore.html");
const GENRE: &str =
    include_str!("../../../fixtures/natomanga/search__support_only_one_tag_at_a_time.html");
const DETAILS: &str = include_str!("../../../fixtures/natomanga/manga_details.html");
const READER: &str = include_str!("../../../fixtures/natomanga/pages.html");
const CHAPTERS_API: &str = include_str!("../../../fixtures/natomanga/chapters_api.json");

#[test]
fn parses_cards_from_every_listing_shape() {
    for (name, html) in [("latest", LATEST), ("hot", HOT), ("genre", GENRE)] {
        let items = parser::parse_cards(html).expect(name);

        assert!(
            items.len() >= 15,
            "{name}: expected a full page of cards, got {}",
            items.len()
        );
        assert!(
            items.iter().all(|i| !i.id.is_empty() && !i.title.is_empty()),
            "{name}: card with an empty id or title"
        );
        assert!(
            items.iter().all(|i| i.cover_url.starts_with("https://")),
            "{name}: card with a non-absolute cover"
        );
    }
}

#[test]
fn drops_sponsored_cards() {
    let items = parser::parse_cards(GENRE).unwrap();

    // The genre page ships 22 `list-comic-item-wrap` blocks; one is a bit.ly ad
    // wearing the same class, so exactly 21 real series should survive.
    assert_eq!(items.len(), 21);
    assert!(
        !items.iter().any(|i| i.title.contains("Jenny Sato")),
        "the injected advertisement card was not filtered out"
    );
}

#[test]
fn reads_covers_from_the_sharded_cdns() {
    let items = parser::parse_cards(GENRE).unwrap();

    let hosts: std::collections::BTreeSet<_> = items
        .iter()
        .filter_map(|i| i.cover_url.split('/').nth(2))
        .collect();

    // Covers are spread across per-series CDN shards, which is the whole reason
    // the parser reads `data-src` rather than building the URL from the slug.
    assert!(
        hosts.len() > 1,
        "expected covers across multiple CDN hosts, saw {hosts:?}"
    );
    assert!(
        hosts
            .iter()
            .all(|h| h.ends_with(".2xstorage.com") || h.ends_with(".waitst.com")),
        "unexpected cover host in {hosts:?}"
    );
}

#[test]
fn detects_pagination_state() {
    // The genre fixture is page 1 of 851.
    let page = parser::parse_listing(GENRE).unwrap();
    assert!(page.has_next, "page 1 of 851 should report a next page");
    assert_eq!(page.items.len(), 21);
}

#[test]
fn parses_manga_details() {
    let manga = parser::parse_manga_details(DETAILS, "the-demonic-cult-instructor-returns").unwrap();

    assert_eq!(manga.title, "The Demonic Cult Instructor Returns");
    assert!(
        manga.description.starts_with("The Central Plains fell"),
        "description not unwrapped from #contentBox: {:?}",
        &manga.description.chars().take(80).collect::<String>()
    );
    assert!(
        !manga.description.contains("summary:"),
        "the `<title> summary:` header leaked into the description"
    );

    let tags: Vec<_> = manga.tags.iter().map(|t| t.label.as_str()).collect();
    assert_eq!(tags, ["Fantasy", "Action", "Adventure", "Manhwa", "Martial arts"]);

    assert!(matches!(manga.status, nomanga_sdk::data::manga::Status::Ongoing));
    assert_eq!(manga.views, Some(674_286));
    assert_eq!(manga.rating, Some(4.80));
    assert_eq!(manga.last_updated, "Jul-26-2026 04:49:49 PM");
    // The fixture credits "Unknown", which should read as no author at all.
    assert!(manga.author.is_empty());

    // Recovered from the JSON-LD blob, since the real `src` was rewritten.
    assert_eq!(
        manga.cover_url,
        "https://storage.waitst.com/thumb/the-demonic-cult-instructor-returns.webp"
    );
}

#[test]
fn parses_chapters_from_the_api() {
    let (chapters, has_more) = parser::parse_chapters_api(CHAPTERS_API, "elf-and-bike").unwrap();

    assert!(!has_more, "the sample response is a complete single page");
    assert_eq!(chapters.len(), 22);

    let newest = &chapters[0];
    assert_eq!(newest.id, "chapter-21");
    assert_eq!(newest.title, "Chapter 21");
    assert_eq!(newest.number, 21.0);
    assert_eq!(newest.upload_date, "2026-05-10T14:00:27.000000Z");
    assert_eq!(
        newest.url,
        "https://www.natomanga.com/manga/elf-and-bike/chapter-21"
    );

    // Decimal chapters come through as a real number rather than being
    // recovered from the display label.
    let half = chapters.iter().find(|c| c.id == "chapter-12-5").unwrap();
    assert_eq!(half.number, 12.5);
    assert_eq!(half.title, "Chapter 12.5");

    // Newest-first, and reaching all the way back to chapter 1 — which is the
    // whole point of preferring this over the 50-row HTML list.
    assert!(chapters.windows(2).all(|w| w[0].number > w[1].number));
    assert_eq!(chapters.last().unwrap().id, "chapter-1");
}

#[test]
fn parses_chapter_list() {
    let chapters =
        parser::parse_chapter_list(DETAILS, "the-demonic-cult-instructor-returns").unwrap();

    // Deliberately 50, not 60: the detail page truncates at the newest 50 and
    // serves the rest from `/api/manga/<slug>/chapters`. This asserts the cap
    // so it fails loudly the day that endpoint gets wired up.
    assert_eq!(chapters.len(), 50);
    assert_eq!(chapters.last().unwrap().id, "chapter-17");

    let newest = &chapters[0];
    assert_eq!(newest.id, "chapter-60");
    assert_eq!(newest.title, "Chapter 60");
    assert_eq!(newest.number, 60.0);
    assert_eq!(newest.upload_date, "14 minutes ago");
    assert_eq!(
        newest.url,
        "https://www.natomanga.com/manga/the-demonic-cult-instructor-returns/chapter-60"
    );

    // Descending order, and every row should have produced a real id.
    assert!(chapters.iter().all(|c| c.id.starts_with("chapter-")));
    assert!(chapters.windows(2).all(|w| w[0].number > w[1].number));
}

#[test]
fn parses_reader_pages() {
    let pages = parser::parse_chapter_pages(READER).unwrap();

    assert_eq!(pages.len(), 103);
    assert_eq!(pages[0].number, 0);
    assert_eq!(
        pages[0].image_url,
        "https://imgs-2.2xstorage.com/the-demonic-cult-instructor-returns/46/0.webp"
    );
    assert_eq!(
        pages[102].image_url,
        "https://imgs-2.2xstorage.com/the-demonic-cult-instructor-returns/46/102.webp"
    );
    assert!(pages.iter().all(|p| p.image_url.starts_with("https://")));
    assert!(
        pages.iter().enumerate().all(|(i, p)| p.number == i as u32),
        "page numbering is not contiguous"
    );
}

#[test]
fn parses_genres_with_an_any_entry() {
    let genres = parser::parse_genres(GENRE).unwrap();

    assert_eq!(genres[0].id, "all");
    assert_eq!(genres[0].label, "Any");
    assert!(genres.len() > 200, "expected the full genre drawer");
    // `all` is the no-filter entry and must not also appear as a real genre.
    assert_eq!(genres.iter().filter(|g| g.id == "all").count(), 1);
    assert!(genres.iter().any(|g| g.id == "action" && g.label == "Action"));
}

#[test]
fn builds_ids_and_search_slugs() {
    assert_eq!(
        slug_from_url("https://www.natomanga.com/manga/one-piece").as_deref(),
        Some("one-piece")
    );
    // Sponsored cards point off-site and have no `/manga/` segment.
    assert_eq!(slug_from_url("https://bit.ly/scrailadi"), None);

    assert_eq!(
        chapter_id_from_url("https://www.natomanga.com/manga/one-piece/chapter-12-2").as_deref(),
        Some("chapter-12-2")
    );

    assert_eq!(search_slug("One Piece"), "one_piece");
    assert_eq!(search_slug("  a   b  "), "a_b");
    assert_eq!(search_slug("Re:Zero kara"), "re_zero_kara");
    assert_eq!(search_slug("!!!"), "");
}
