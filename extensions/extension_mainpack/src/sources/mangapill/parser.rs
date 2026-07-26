use crate::sources::mangapill::util::{
    id_from_chapter_url, id_from_series_url, parse_leading_number, status,
};
use nomanga_sdk::data::chapter::Chapter;
use nomanga_sdk::parse::{document, selector, text_opt};
use nomanga_sdk::prelude::*;
use scraper::ElementRef;

/// Every listing on the site — search, trending, recently-added — renders the
/// same card, so one parser covers all of them. Covers are lazy-loaded, which
/// is why the URL lives on `data-src` rather than `src`.
pub fn parse_cards(html: &str) -> SourceResult<Vec<MangaSimple>> {
    let doc = document(html);

    let card_sel = selector(r#"a.relative.block[href^="/manga/"]"#)?;
    let img_sel = selector("img")?;
    let title_sel = selector("div.font-black")?;
    // The title div is also `line-clamp-2`, so the blurb has to be pinned by
    // `text-secondary` as well or it just echoes the title back.
    let desc_sel = selector("div.line-clamp-2.text-secondary")?;

    let mut items = Vec::new();

    for link in doc.select(&card_sel) {
        let url = link.value().attr("href").unwrap_or_default();
        let id = id_from_series_url(url)?;

        let cover_url = link
            .select(&img_sel)
            .next()
            .and_then(|img| img.value().attr("data-src"))
            .unwrap_or_default()
            .to_owned();

        // Title and blurb are siblings of the cover link, not children, so
        // step up to the card wrapper before looking for them.
        let card = link.parent().and_then(ElementRef::wrap);

        let title = card
            .and_then(|card| card.select(&title_sel).next())
            .map(|el| el.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        if title.is_empty() {
            continue;
        }

        let description = card
            .and_then(|card| card.select(&desc_sel).next())
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

pub fn parse_search(html: &str) -> SourceResult<MangaPage> {
    let items = parse_cards(html)?;

    // The pager only renders when there is somewhere to go, so the presence of
    // a "Next" anchor is the whole signal — there is no result count to do
    // arithmetic on.
    let doc = document(html);
    let anchor = selector("a")?;
    let has_next = doc
        .select(&anchor)
        .any(|a| a.text().collect::<String>().trim() == "Next");

    Ok(MangaPage { items, has_next })
}

pub fn parse_manga_details(html: &str, manga_id: &str) -> SourceResult<Manga> {
    let doc = document(html);
    let root = doc.root_element();

    let title = text_opt(root, "h1").unwrap_or_default();
    let description = text_opt(root, "p.text--secondary").unwrap_or_default();

    let cover_url = doc
        .select(&selector("img[data-src]")?)
        .next()
        .and_then(|img| img.value().attr("data-src"))
        .unwrap_or_default()
        .to_owned();

    let tags = doc
        .select(&selector(r#"a[href*="/search?genre="]"#)?)
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
        description,
        tags,
        cover_url,
        // MangaPill's detail page carries only Type, Status and Year — it has
        // no author or artist credits to read.
        author: Vec::new(),
        artist: Vec::new(),
        status: status(&labelled_value(&doc, "Status").unwrap_or_default()),
        last_updated: String::new(),
        rating: None,
        views: None,
    })
}

/// The Type/Status/Year block pairs a `<label>` with the `<div>` right after
/// it; neither carries a distinguishing class, so match on the label text.
fn labelled_value(doc: &scraper::Html, label: &str) -> Option<String> {
    let label_sel = selector("label").ok()?;

    doc.select(&label_sel)
        .find(|el| el.text().collect::<String>().trim() == label)
        .and_then(|el| el.next_siblings().find_map(ElementRef::wrap))
        .map(|el| el.text().collect::<String>().trim().to_owned())
}

pub fn parse_chapter_list(html: &str, manga_id: &str) -> SourceResult<Vec<Chapter>> {
    let doc = document(html);
    // Scoping to `#chapters` keeps the header's own `/chapters` nav link out.
    let chapter_sel = selector(r##"#chapters a[href^="/chapters/"]"##)?;

    let mut chapters = Vec::new();

    for link in doc.select(&chapter_sel) {
        let url = link.value().attr("href").unwrap_or_default();
        let id = id_from_chapter_url(url)?;
        let title = link.text().collect::<String>().trim().to_owned();

        chapters.push(Chapter {
            id,
            number: parse_leading_number(&title),
            title,
            manga_id: manga_id.to_owned(),
            volume: None,
            language: "en".to_owned(),
            upload_date: String::new(),
            page_count: None,
            scanlator: None,
            url: format!("https://mangapill.com{url}"),
            is_locked: false,
        });
    }

    Ok(chapters)
}

pub fn parse_chapter_pages(html: &str) -> SourceResult<Vec<Page>> {
    let doc = document(html);
    let page_sel = selector("img.js-page")?;

    let mut pages = Vec::new();

    for img in doc.select(&page_sel) {
        let Some(src) = img.value().attr("data-src") else {
            continue;
        };
        if !src.starts_with("http") {
            continue;
        }

        pages.push(Page {
            number: pages.len() as u32,
            image_url: src.to_owned(),
        });
    }

    Ok(pages)
}

/// Genres come from the search form's checkboxes so the list tracks the site
/// rather than a hardcoded copy that silently goes stale.
pub fn parse_genres(html: &str) -> SourceResult<Vec<SelectOption>> {
    let doc = document(html);
    let genre_sel = selector(r#"input[name="genre"]"#)?;

    Ok(doc
        .select(&genre_sel)
        .filter_map(|el| el.value().attr("value"))
        .filter(|v| !v.is_empty())
        .map(|v| SelectOption {
            id: v.to_owned(),
            label: v.to_owned(),
        })
        .collect())
}
