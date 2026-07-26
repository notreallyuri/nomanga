use crate::sources::natomanga::util::{
    chapter_id_from_url, parse_count, parse_leading_number, parse_parenthesised_number,
    slug_from_url, status,
};
use nomanga_sdk::data::chapter::Chapter;
use nomanga_sdk::parse::{document, selector};
use nomanga_sdk::prelude::*;
use scraper::ElementRef;

const DOMAIN: &str = "https://www.natomanga.com";

/// Genre pages, the `/manga-list/*` browse pages and text search all render the
/// same card, so one parser covers every listing on the site.
pub fn parse_cards(html: &str) -> SourceResult<Vec<MangaSimple>> {
    let doc = document(html);

    let card_sel = selector("div.list-comic-item-wrap")?;
    let cover_sel = selector("a.list-story-item")?;
    let img_sel = selector("img")?;
    let title_sel = selector("h3 a")?;
    let desc_sel = selector("p")?;

    let mut items = Vec::new();

    for card in doc.select(&card_sel) {
        // Sponsored cards share the wrapper class but link off-site, so the
        // missing `/manga/` segment is what drops them.
        let Some(link) = card.select(&cover_sel).next() else {
            continue;
        };
        let Some(id) = link.value().attr("href").and_then(slug_from_url) else {
            continue;
        };

        // Covers are lazy-loaded: `src` is a placeholder, the real CDN URL is on
        // `data-src`. Which CDN varies per series, so it has to be read, not built.
        let cover_url = link
            .select(&img_sel)
            .next()
            .and_then(|img| img.value().attr("data-src"))
            .filter(|src| src.starts_with("http"))
            .unwrap_or_default()
            .to_owned();

        let title = card
            .select(&title_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        if title.is_empty() {
            continue;
        }

        let description = card
            .select(&desc_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .filter(|d| !d.is_empty());

        items.push(MangaSimple {
            id,
            title,
            description,
            cover_url,
        });
    }

    Ok(items)
}

pub fn parse_listing(html: &str) -> SourceResult<MangaPage> {
    let items = parse_cards(html)?;
    Ok(MangaPage {
        items,
        has_next: has_next_page(html)?,
    })
}

/// The pager renders `First(1) … Last(851)` alongside the current page, so the
/// two numbers together are the only reliable "is there more" signal — there is
/// no `Next` anchor to look for.
fn has_next_page(html: &str) -> SourceResult<bool> {
    let doc = document(html);

    let current = doc
        .select(&selector("div.group_page a.page_select")?)
        .next()
        .and_then(|el| el.text().collect::<String>().trim().parse::<u32>().ok())
        .unwrap_or(1);

    let last = doc
        .select(&selector("div.group_page a.page_last")?)
        .next()
        .and_then(|el| parse_parenthesised_number(&el.text().collect::<String>()));

    // A single-page result set renders no `Last(…)` anchor at all.
    Ok(last.is_some_and(|last| current < last))
}

pub fn parse_manga_details(html: &str, manga_id: &str) -> SourceResult<Manga> {
    let doc = document(html);
    let root = doc.root_element();

    let title = doc
        .select(&selector("ul.manga-info-text h1")?)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_owned())
        .unwrap_or_default();

    let author = labelled(&doc, "Author(s)")
        .filter(|a| !a.eq_ignore_ascii_case("Unknown"))
        .map(|a| {
            a.split([',', ';'])
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let tags = doc
        .select(&selector("li.genres a")?)
        .map(|a| {
            let label = a.text().collect::<String>().trim().to_owned();
            Tag {
                id: label.clone(),
                label,
            }
        })
        .filter(|t| !t.label.is_empty())
        .collect();

    Ok(Manga {
        id: manga_id.to_owned(),
        title,
        description: parse_description(&doc),
        tags,
        cover_url: parse_cover(&doc),
        author,
        // The detail page credits authors only; there is no separate artist row.
        artist: Vec::new(),
        status: status(&labelled(&doc, "Status").unwrap_or_default()),
        last_updated: labelled(&doc, "Last updated").unwrap_or_default(),
        rating: root
            .select(&selector("div.rating")?)
            .next()
            .and_then(|el| el.value().attr("data-default"))
            .and_then(|v| v.parse().ok()),
        views: labelled(&doc, "View").as_deref().and_then(parse_count),
    })
}

/// The info block is a flat `<ul>` of `Label : value` text nodes with no classes
/// to grab, so the label text itself is the only handle.
fn labelled(doc: &scraper::Html, label: &str) -> Option<String> {
    let li_sel = selector("ul.manga-info-text li").ok()?;

    doc.select(&li_sel).find_map(|el| {
        let text = el.text().collect::<String>();
        let (found, value) = text.split_once(':')?;
        (found.trim() == label).then(|| value.trim().to_owned())
    })
}

/// The synopsis sits in `#contentBox` behind an `<h2>` that repeats the title
/// as "<title> summary:", so everything up to and including that marker goes.
fn parse_description(doc: &scraper::Html) -> String {
    let Ok(sel) = selector("#contentBox") else {
        return String::new();
    };

    doc.select(&sel)
        .next()
        .map(|el| {
            let text = el.text().collect::<String>();
            match text.find("summary:") {
                Some(i) => text[i + "summary:".len()..].trim().to_owned(),
                None => text.trim().to_owned(),
            }
        })
        .unwrap_or_default()
}

/// The detail-page `<img>` carries no `data-src`, but the page also embeds a
/// schema.org AggregateRating blob that repeats the cover URL — and that one
/// survives "save page as", which the raw `src` does not.
fn parse_cover(doc: &scraper::Html) -> String {
    if let Ok(sel) = selector(r#"script[type="application/ld+json"]"#) {
        for script in doc.select(&sel) {
            let raw = script.text().collect::<String>();
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
                continue;
            };
            if let Some(url) = value
                .get("itemReviewed")
                .and_then(|item| item.get("image"))
                .and_then(serde_json::Value::as_str)
                .filter(|url| url.starts_with("http"))
            {
                return url.to_owned();
            }
        }
    }

    selector("div.manga-info-pic img")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|img| img.value().attr("src"))
        .filter(|src| src.starts_with("http"))
        .unwrap_or_default()
        .to_owned()
}

/// Fallback for [`parse_chapters_api`]: the detail page pre-renders only the 50
/// most recent chapters, so this loses everything older on long series. It is
/// here purely so a shape change in the JSON API degrades to a partial list
/// rather than to nothing at all.
pub fn parse_chapter_list(html: &str, manga_id: &str) -> SourceResult<Vec<Chapter>> {
    let doc = document(html);
    let row_sel = selector("#chapter-list-container div.chapter-list div.row")?;
    let link_sel = selector("a")?;
    let span_sel = selector("span")?;

    let mut chapters = Vec::new();

    for row in doc.select(&row_sel) {
        let Some(link) = row.select(&link_sel).next() else {
            continue;
        };
        let url = link.value().attr("href").unwrap_or_default();
        let Some(id) = chapter_id_from_url(url) else {
            continue;
        };

        let title = link.text().collect::<String>().trim().to_owned();
        // The row is `<span><a>name</a></span><span>views</span><span>time</span>`,
        // so the upload date is the third span.
        let upload_date = row
            .select(&span_sel)
            .nth(2)
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        chapters.push(Chapter {
            number: parse_leading_number(&title),
            title,
            manga_id: manga_id.to_owned(),
            volume: None,
            language: "en".to_owned(),
            upload_date,
            page_count: None,
            scanlator: None,
            url: format!("{DOMAIN}/manga/{manga_id}/{id}"),
            is_locked: false,
            id,
        });
    }

    if chapters.is_empty() {
        return Err(SourceError::Parse {
            message: "no chapters in #chapter-list-container — the list may now be \
                      rendered client-side from /api/manga/<slug>/chapters"
                .to_owned(),
        });
    }

    Ok(chapters)
}

#[derive(serde::Deserialize)]
struct ChaptersEnvelope {
    data: ChaptersData,
}

#[derive(serde::Deserialize)]
struct ChaptersData {
    chapters: Vec<ApiChapter>,
    pagination: ApiPagination,
}

#[derive(serde::Deserialize)]
struct ApiChapter {
    chapter_name: String,
    chapter_slug: String,
    chapter_num: f32,
    updated_at: String,
    // The payload also carries `view`, a read count with nowhere to go on
    // `Chapter` — serde drops unknown fields, so it is simply not declared.
}

#[derive(serde::Deserialize)]
struct ApiPagination {
    has_more: bool,
}

/// The real chapter list comes from `/api/manga/<slug>/chapters?limit&offset`,
/// which is what the detail page's own JS calls. Returns the page of chapters
/// plus whether another `offset` remains, so the caller drives the paging.
///
/// Preferred over [`parse_chapter_list`] because the HTML only ever carries the
/// newest 50, and because `chapter_num` here is authoritative — no digit-picking
/// out of a display label.
pub fn parse_chapters_api(json: &str, manga_id: &str) -> SourceResult<(Vec<Chapter>, bool)> {
    let envelope: ChaptersEnvelope =
        serde_json::from_str(json).map_err(|e| SourceError::Parse {
            message: format!("chapters api: {e}"),
        })?;

    let chapters = envelope
        .data
        .chapters
        .into_iter()
        .map(|c| Chapter {
            url: format!("{DOMAIN}/manga/{manga_id}/{}", c.chapter_slug),
            id: c.chapter_slug,
            title: c.chapter_name,
            manga_id: manga_id.to_owned(),
            number: c.chapter_num,
            volume: None,
            language: "en".to_owned(),
            upload_date: c.updated_at,
            page_count: None,
            scanlator: None,
            is_locked: false,
        })
        .collect();

    Ok((chapters, envelope.data.pagination.has_more))
}

pub fn parse_chapter_pages(html: &str) -> SourceResult<Vec<Page>> {
    let doc = document(html);
    let img_sel = selector("div.container-chapter-reader img")?;

    let mut pages = Vec::new();

    for img in doc.select(&img_sel) {
        let Some(src) = image_url(img) else {
            continue;
        };

        pages.push(Page {
            number: pages.len() as u32,
            image_url: src,
        });
    }

    Ok(pages)
}

/// Reader images are plain `src`, but each one also names a backup CDN in its
/// `onerror` handler. Reading that as a fallback costs nothing live and is what
/// makes the saved fixtures parseable, since "save page as" rewrites `src` to a
/// local path but leaves the handler alone.
fn image_url(img: ElementRef<'_>) -> Option<String> {
    let el = img.value();

    if let Some(src) = el.attr("src").filter(|s| s.starts_with("http")) {
        return Some(src.to_owned());
    }

    let onerror = el.attr("onerror")?;
    let start = onerror.find("this.src='")? + "this.src='".len();
    let end = onerror[start..].find('\'')? + start;

    Some(onerror[start..end].to_owned())
        .filter(|url: &String| url.starts_with("http"))
}

/// Genres come from the filter drawer so the list tracks the site rather than a
/// hardcoded copy. Note `/genre/all` is the "no filter" entry, not a real genre.
pub fn parse_genres(html: &str) -> SourceResult<Vec<SelectOption>> {
    let doc = document(html);
    let genre_sel = selector("ul.tag-name li a")?;

    Ok(std::iter::once(SelectOption {
        id: "all".to_owned(),
        label: "Any".to_owned(),
    })
    .chain(
        doc.select(&genre_sel)
            .filter_map(|a| {
                let id = a.value().attr("href")?.rsplit('/').next()?.to_owned();
                let label = a.text().collect::<String>().trim().to_owned();
                (!id.is_empty() && !label.is_empty() && id != "all")
                    .then_some(SelectOption { id, label })
            })
            .collect::<Vec<_>>(),
    )
    .collect())
}
