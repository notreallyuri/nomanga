//! The Webtoons parsers are verified live through `nomanga-cli` rather than
//! against fixtures, since the site is reachable. What is worth pinning down
//! here is the id handling and the count/status conversions, where a silent
//! change would corrupt stored library entries rather than just fail loudly.

use super::util::{SeriesId, parse_abbreviated_count, series_id_from_url, status};
use nomanga_sdk::data::manga::Status;

const DOMAIN: &str = "https://www.webtoons.com";

#[test]
fn round_trips_series_ids() {
    let id = series_id_from_url("https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95")
        .unwrap();
    assert_eq!(id, "fantasy/tower-of-god/95");

    let series = SeriesId::parse(&id).unwrap();
    assert_eq!(
        series.list_url(DOMAIN, 3),
        "https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95&page=3"
    );
    // The episode slug is a placeholder — the viewer resolves off the query.
    assert_eq!(
        series.viewer_url(DOMAIN, "1"),
        "https://www.webtoons.com/en/fantasy/tower-of-god/x/viewer?title_no=95&episode_no=1"
    );
}

#[test]
fn keeps_canvas_titles_distinguishable() {
    // Canvas series 404 unless the path says `canvas`, so the collection has to
    // survive in the id rather than being normalised away.
    let id = series_id_from_url(
        "https://www.webtoons.com/en/canvas/rain-girl/list?title_no=628650",
    )
    .unwrap();
    assert_eq!(id, "canvas/rain-girl/628650");
    assert_eq!(SeriesId::parse(&id).unwrap().genre, "canvas");
}

#[test]
fn rejects_urls_that_are_not_series_links() {
    // Header and navigation links carry no `title_no`.
    assert_eq!(series_id_from_url("https://www.webtoons.com/en/originals"), None);
    // A `title_no` that is not numeric is not a series id.
    assert_eq!(
        series_id_from_url("https://www.webtoons.com/en/a/b/list?title_no=abc"),
        None
    );
}

#[test]
fn parses_abbreviated_counts() {
    assert_eq!(parse_abbreviated_count("1.3B"), Some(1_300_000_000));
    assert_eq!(parse_abbreviated_count("4.2M"), Some(4_200_000));
    assert_eq!(parse_abbreviated_count("15K"), Some(15_000));
    assert_eq!(parse_abbreviated_count("288,979"), Some(288_979));
    assert_eq!(parse_abbreviated_count("Like"), None);
}

#[test]
fn reads_status_from_the_schedule_line() {
    assert!(matches!(status("UPEVERY MONDAY"), Status::Ongoing));
    assert!(matches!(status("COMPLETED"), Status::Completed));
    assert!(matches!(status("HIATUS"), Status::Hiatus));
    assert!(matches!(status(""), Status::Unknown));
}

#[test]
fn finds_covers_in_every_card_shape() {
    // Canvas renders flagged titles with a different skin — `harmful_black_skin2`
    // swaps `span.img_area` for `div.pic_area`, which silently cost those cards
    // their cover until the selector covered it.
    let html = r#"
      <a href="/en/fantasy/tower-of-god/list?title_no=95">
        <div class="image_wrap"><img src="https://cdn/o.jpg?type=q90"></div>
        <div class="info_text"><p class="title">Originals Card</p></div>
      </a>
      <a href="/en/canvas/a/list?title_no=1">
        <span class="img_area"><span class="thum_skin"></span><img src="https://cdn/c1.png?type=f164_164"></span>
        <p class="subj">Canvas Skin One</p>
      </a>
      <a href="/en/canvas/b/list?title_no=2">
        <div class="pic_area"><img src="https://cdn/c2.jpg?type=a92"></div>
        <p class="subj">Canvas Skin Two</p>
      </a>
    "#;

    let cards = super::parser::parse_cards(html).unwrap();
    let covers: Vec<_> = cards.iter().map(|c| c.cover_url.as_str()).collect();

    assert_eq!(cards.len(), 3);
    assert!(covers.iter().all(|c| !c.is_empty()), "{covers:?}");
    // Square thumbnails are upgraded to the full-size rendition.
    assert_eq!(
        covers,
        vec![
            "https://cdn/o.jpg?type=q90",
            "https://cdn/c1.png?type=q90",
            "https://cdn/c2.jpg?type=q90",
        ]
    );
}
