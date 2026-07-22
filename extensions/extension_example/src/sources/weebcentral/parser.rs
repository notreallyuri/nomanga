use crate::sources::weebcentral::util::{
    id_from_chapter_url, id_from_series_url, parse_leading_number, status,
};
use nomanga_sdk::data::chapter::Chapter;
use nomanga_sdk::parse::{attr, document, select_containing, selector, text_opt};
use nomanga_sdk::prelude::*;

pub fn parse_chapter_list(html: &str, manga_id: &str) -> SourceResult<Vec<Chapter>> {
    let doc = document(html);

    let item_sel = selector(r#"div[x-data*="checkNewChapter"]"#)?;

    let mut chapters = Vec::new();

    for item in doc.select(&item_sel) {
        let url = attr(item, "a", "href")?;
        let id = id_from_chapter_url(&url)?;
        let title = text_opt(item, "a > span:nth-of-type(2) > span").unwrap_or_default();
        let upload_date = text_opt(item, "time").unwrap_or_default();

        chapters.push(Chapter {
            id,
            title: title.clone(),
            manga_id: manga_id.to_string(),
            number: parse_leading_number(&title),
            volume: None,
            language: "en".to_owned(),
            upload_date,
            page_count: None,
            scanlator: None,
            url,
            is_locked: false,
        })
    }

    Ok(chapters)
}

pub fn parse_manga_details(html: &str, manga_id: &str) -> SourceResult<Manga> {
    let doc = document(html);
    let root = doc.root_element();

    let cover_url = attr(root, "picture > source", "srcset").unwrap_or_default();
    let title = text_opt(root, "h1.text-2xl").unwrap_or_default();

    let author = select_containing(root, "li", "Author(s):", "a")?;
    let tags = select_containing(root, "li", "Tags(s): ", "a")?
        .into_iter()
        .map(|t| Tag {
            id: t.clone(),
            label: t,
        })
        .collect();
    let raw_status = select_containing(root, "li", "Status:", "a")?
        .into_iter()
        .next()
        .unwrap_or_default();

    let li_sel = selector("li")?;
    let strong_sel = selector("strong")?;
    let p_sel = selector("p")?;

    let description = doc
        .select(&li_sel)
        .find(|li| {
            li.select(&strong_sel)
                .next()
                .map(|s| s.text().collect::<String>().trim() == "Description")
                .unwrap_or(false)
        })
        .and_then(|li| li.select(&p_sel).next())
        .map(|p| p.text().collect::<String>().trim().to_owned())
        .unwrap_or_default();

    Ok(Manga {
        id: manga_id.to_owned(),
        title,
        description,
        tags,
        cover_url,
        author,
        artist: Vec::new(),
        status: status(&raw_status),
        last_updated: String::new(),
        rating: None,
        views: None,
    })
}

pub fn parse_hot_updates(html: &str) -> SourceResult<HomepageSection> {
    let doc = document(html);

    let section_sel = selector("section")?;
    let label_sel = selector("h2 > span > span")?;

    let article_sel = selector(r"article.md\:hidden")?;
    let series_link = selector(r#"a[href*="/series/"]"#)?;
    let title_sel = selector("a > div.truncate")?;
    let img_sel = selector("img")?;

    let hot_section = doc.select(&section_sel).find(|section| {
        section
            .select(&label_sel)
            .any(|s| s.text().collect::<String>().trim() == "Hot Updates")
    });

    let mut items = Vec::new();

    let Some(section) = hot_section else {
        return Err(SourceError::Parse {
            message: "no 'Hot Updates' section found".into(),
        });
    };

    for article in section.select(&article_sel) {
        let Some(link) = article.select(&series_link).next() else {
            continue;
        };
        let url = link.value().attr("href").unwrap_or_default();
        let id = id_from_series_url(url)?;

        let title = article
            .select(&title_sel)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        let cover_url = article
            .select(&img_sel)
            .next()
            .and_then(|e| e.value().attr("src"))
            .unwrap_or_default()
            .to_owned();

        items.push(MangaSimple {
            id,
            title,
            description: None,
            cover_url,
        })
    }

    Ok(HomepageSection {
        id: "hot-updates".to_owned(),
        title: "Hot Updates".to_owned(),
        layout: SectionLayout::SingleRow,
        paginable: false,
        items,
    })
}

pub fn parse_latest_updates(html: &str) -> SourceResult<HomepageSection> {
    let doc = document(html);

    let article_sel = selector("article")?;
    let title_sel = selector("div.font-semibold")?;
    let series_link = selector(r#"a[href*="/series/"]"#)?;
    let img_sel = selector("picture > img")?;

    let mut items = Vec::new();

    for article in doc.select(&article_sel) {
        let Some(link) = article.select(&series_link).next() else {
            continue;
        };
        let url = link.value().attr("href").unwrap_or_default();
        let id = id_from_series_url(url)?;

        let title = article
            .select(&title_sel)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        let cover_url = article
            .select(&img_sel)
            .next()
            .and_then(|e| e.value().attr("src"))
            .unwrap_or_default()
            .to_owned();

        items.push(MangaSimple {
            id,
            title,
            description: None,
            cover_url,
        })
    }

    Ok(HomepageSection {
        id: "latest-updates".to_owned(),
        title: "Latest Updates".to_owned(),
        layout: SectionLayout::TripleRow,
        items,
        paginable: true,
    })
}

pub fn parse_chapter_details(html: &str) -> SourceResult<(String, f32)> {
    let doc = document(html);
    let root = doc.root_element();

    let title = text_opt(root, "section#nav-top > div > div button span").unwrap_or_default();

    let number = parse_leading_number(&title);
    Ok((title, number))
}

pub fn parse_tags(html: &str) -> SourceResult<Vec<SelectOption>> {
    let doc = document(html);
    let title_sel = selector("div.collapse-title")?;
    let label_sel = selector("label > span")?;

    let content = doc
        .select(&title_sel)
        .find(|el| el.text().collect::<String>().trim() == "Tags")
        .and_then(|title| {
            title
                .next_siblings()
                .filter_map(scraper::ElementRef::wrap)
                .find(|el| {
                    el.value().has_class(
                        "collapse-content",
                        scraper::CaseSensitivity::AsciiCaseInsensitive,
                    )
                })
        });

    let Some(content) = content else {
        return Ok(Vec::new());
    };

    let mut tags = Vec::new();
    for span in content.select(&label_sel) {
        let text = span.text().collect::<String>().trim().to_owned();
        if !text.is_empty() {
            tags.push(SelectOption {
                id: text.clone(),
                label: text,
            });
        }
    }
    Ok(tags)
}

pub fn parse_search(html: &str) -> SourceResult<MangaPage> {
    let doc = document(html);
    let article_sel = selector("article")?;
    let title_sel = selector("a.line-clamp-1.link-hover")?;
    let series_link = selector(r#"a[href*="/series/"]"#)?;
    let img_sel = selector("picture > source")?;

    let mut items = Vec::new();
    for article in doc.select(&article_sel) {
        let Some(link) = article.select(&series_link).next() else {
            continue;
        };
        let url = link.value().attr("href").unwrap_or_default();
        let id = id_from_series_url(url)?;

        let title = article
            .select(&title_sel)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_owned())
            .unwrap_or_default();

        let cover_url = article
            .select(&img_sel)
            .next()
            .and_then(|e| e.value().attr("srcset"))
            .unwrap_or_default()
            .to_owned();

        if title.is_empty() || cover_url.is_empty() {
            continue;
        }
        items.push(MangaSimple {
            id,
            title,
            description: None,
            cover_url,
        });
    }

    Ok(MangaPage {
        items,
        has_next: false,
    })
}
