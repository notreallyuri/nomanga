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
