use crate::sources::webtoons::util::{
    SeriesId, parse_abbreviated_count, parse_number, series_id_from_url, status,
};
use nomanga_sdk::data::chapter::Chapter;
use nomanga_sdk::parse::{document, selector, text_opt};
use nomanga_sdk::prelude::*;

/// The site ships two card shapes and this covers both, because a source that
/// only handled one would silently return an empty Canvas listing:
///
/// - Originals / genre / search wrap `.info_text` with `.title` + `.author`,
///   cover in `.image_wrap img` (the anchor class differs per page —
///   `_card_item`, `_genre_title_a`, `_originals_title_a` — so it is not used).
/// - Canvas (`a.challenge_item`) puts `p.subj` + `p.author` directly in the
///   anchor with the cover in `.img_area img`.
///
/// Requiring a title is what separates real cards from the bare `title_no`
/// links in navigation and "you may also like" strips.
pub fn parse_cards(html: &str) -> SourceResult<Vec<MangaSimple>> {
    let doc = document(html);

    let card_sel = selector(r#"a[href*="title_no="]"#)?;
    let title_sel = selector(".info_text .title, p.subj")?;
    let author_sel = selector(".info_text .author, p.author")?;
    // Originals cards print the genre where every other listing prints the
    // creator, so it stands in as the subtitle. Kept as a separate lookup
    // rather than one selector list because `select` yields document order,
    // which would pick genre over author on Canvas cards that carry both.
    let genre_sel = selector(".info_text .genre, p.genre")?;
    let img_sel = selector("div.image_wrap img, span.img_area img")?;

    let mut items = Vec::new();
    let mut seen = std::collections::BTreeSet::new();

    for link in doc.select(&card_sel) {
        let Some(id) = link.value().attr("href").and_then(series_id_from_url) else {
            continue;
        };

        let title = link
            .select(&title_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        if title.is_empty() || !seen.insert(id.clone()) {
            continue;
        }

        items.push(MangaSimple {
            id,
            title,
            description: link
                .select(&author_sel)
                .next()
                .or_else(|| link.select(&genre_sel).next())
                .map(|el| el.text().collect::<String>().trim().to_owned())
                .filter(|d| !d.is_empty()),
            cover_url: link
                .select(&img_sel)
                .next()
                .and_then(|img| img.value().attr("src"))
                .filter(|src| src.starts_with("http"))
                .unwrap_or_default()
                .to_owned(),
        });
    }

    Ok(items)
}

/// Listings paginate at 30 a page. The pager only renders a window of page
/// numbers, so the reliable test is whether it links the page after this one —
/// genre and Originals listings render everything at once and have no pager at
/// all, which correctly reads as "no next page".
///
/// Two pager markups exist: episode and Canvas listings use
/// `.paginate a.pg_page`, search results use `.list_pagination a.pagination`.
/// Both are matched, since handling only one silently caps results at 30.
pub fn parse_listing(html: &str, page: u32) -> SourceResult<MangaPage> {
    let items = parse_cards(html)?;
    let doc = document(html);
    let next = format!("page={}", page.saturating_add(1));

    let has_next = doc
        .select(&selector("div.paginate a, div.list_pagination a")?)
        .filter_map(|a| a.value().attr("href"))
        .any(|href| href.ends_with(&next));

    Ok(MangaPage { items, has_next })
}

pub fn parse_manga_details(html: &str, manga_id: &str) -> SourceResult<Manga> {
    let doc = document(html);
    let root = doc.root_element();

    let genre = text_opt(root, "h2.genre").unwrap_or_default();

    // The header cover is landscape key art; og:image is the portrait poster the
    // listings use, so it is what the library grid should get.
    let cover_url = doc
        .select(&selector(r#"meta[property="og:image"]"#)?)
        .next()
        .and_then(|m| m.value().attr("content"))
        .unwrap_or_default()
        .to_owned();

    // `.author_area` holds the credit plus an "author info" button; the button's
    // label has to come off or it lands in the name.
    let author = doc
        .select(&selector("div.author_area")?)
        .next()
        .map(|el| {
            el.text()
                .map(str::trim)
                .filter(|t| !t.is_empty() && *t != "author info")
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|a| !a.is_empty())
        .map(|a| vec![a])
        .unwrap_or_default();

    let counts: Vec<u64> = doc
        .select(&selector("ul.grade_area em.cnt")?)
        .filter_map(|el| parse_abbreviated_count(&el.text().collect::<String>()))
        .collect();

    Ok(Manga {
        id: manga_id.to_owned(),
        title: text_opt(root, "h1.subj").unwrap_or_default(),
        description: text_opt(root, "p.summary").unwrap_or_default(),
        // A series carries exactly one genre on Webtoons, not a tag list.
        tags: if genre.is_empty() {
            Vec::new()
        } else {
            vec![Tag {
                id: genre.clone(),
                label: genre,
            }]
        },
        cover_url,
        author,
        artist: Vec::new(),
        status: status(&text_opt(root, "p.day_info").unwrap_or_default()),
        last_updated: String::new(),
        rating: None,
        // `grade_area` is views then subscribers, in that order.
        views: counts.first().copied(),
    })
}

/// Returns the episodes on this page. The caller pages until nothing new turns
/// up, because out-of-range pages quietly serve page 1 again rather than 404 —
/// so an empty result is not a reliable stop signal on its own.
pub fn parse_episode_list(html: &str, manga_id: &str) -> SourceResult<Vec<Chapter>> {
    let series = SeriesId::parse(manga_id)?;
    let doc = document(html);

    let item_sel = selector("li._episodeItem")?;
    let subj_sel = selector("span.subj")?;
    let date_sel = selector("span.date")?;

    let mut chapters = Vec::new();

    for item in doc.select(&item_sel) {
        let Some(episode_no) = item.value().attr("data-episode-no") else {
            continue;
        };

        let title = item
            .select(&subj_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .unwrap_or_else(|| format!("Episode {episode_no}"));

        chapters.push(Chapter {
            id: episode_no.to_owned(),
            title,
            manga_id: manga_id.to_owned(),
            number: parse_number(episode_no),
            volume: None,
            language: "en".to_owned(),
            upload_date: item
                .select(&date_sel)
                .next()
                .map(|el| el.text().collect::<String>().trim().to_owned())
                .unwrap_or_default(),
            page_count: None,
            scanlator: None,
            url: series.viewer_url("https://www.webtoons.com", episode_no),
            is_locked: false,
        });
    }

    Ok(chapters)
}

/// Viewer images are lazy-loaded: `src` is a shared transparent placeholder and
/// the real URL sits on `data-url`.
pub fn parse_viewer_pages(html: &str) -> SourceResult<Vec<Page>> {
    let doc = document(html);
    let img_sel = selector("#_imageList img._images")?;

    let mut pages = Vec::new();

    for img in doc.select(&img_sel) {
        let Some(url) = img
            .value()
            .attr("data-url")
            .filter(|u| u.starts_with("http"))
        else {
            continue;
        };

        pages.push(Page {
            number: pages.len() as u32,
            image_url: url.to_owned(),
        });
    }

    Ok(pages)
}

/// Genres come from the browse nav so the list tracks the site.
pub fn parse_genres(html: &str) -> SourceResult<Vec<SelectOption>> {
    let doc = document(html);
    let sel = selector(r#"a[href*="/genres/"]"#)?;

    let mut seen = std::collections::BTreeSet::new();
    let mut genres = Vec::new();

    for link in doc.select(&sel) {
        let Some(id) = link
            .value()
            .attr("href")
            .and_then(|h| h.split("/genres/").nth(1))
            .map(|s| s.split(['?', '#', '/']).next().unwrap_or(s).to_owned())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };

        let label = link.text().collect::<String>().trim().to_owned();
        if label.is_empty() || !seen.insert(id.clone()) {
            continue;
        }

        genres.push(SelectOption { id, label });
    }

    Ok(genres)
}
