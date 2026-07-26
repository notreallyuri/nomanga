pub(super) mod parser;
pub(super) mod util;

#[cfg(test)]
mod tests;

use nomanga_sdk::{
    data::{
        chapter::{Chapter, Page},
        homepage::Homepage,
        manga::Manga,
    },
    extension::{
        error::SourceResult,
        filter::Filter,
        query::{ChapterRef, MangaPage, MangaRef, SearchQuery},
        source::{Source, SourceInfo},
    },
    guest,
    parse::encode_query,
    prelude::*,
};

use util::SeriesId;

const DOMAIN: &str = "https://www.webtoons.com";

/// Episode lists render 10 a page and there is no bulk endpoint — the JSON API
/// Naver exposes requires HMAC-signed requests, and the RSS feed truncates at
/// the newest 20. So a long series genuinely costs one request per 10 episodes;
/// the cap keeps that bounded at 1000.
const MAX_EPISODE_PAGES: u32 = 100;

/// `/en/canvas` is a carousel-style discover page whose markup carries no usable
/// cards; this is the paginated Canvas catalogue, 30 a page.
fn canvas_list_url(page: u32) -> String {
    format!("{DOMAIN}/en/canvas/list?genreTab=ALL&page={page}")
}

pub struct WebtoonsSource;

impl WebtoonsSource {
    /// Out-of-range pages serve page 1 again instead of 404ing, so paging stops
    /// on the first page that contributes no episode we have not already seen.
    fn all_episodes(&self, manga_id: &str) -> SourceResult<Vec<Chapter>> {
        let series = SeriesId::parse(manga_id)?;

        let mut chapters: Vec<Chapter> = Vec::new();
        let mut seen = std::collections::BTreeSet::new();

        for page in 1..=MAX_EPISODE_PAGES {
            let html = guest::get_text(&series.list_url(DOMAIN, page))?;
            let batch = parser::parse_episode_list(&html, manga_id)?;

            let mut added = false;
            for chapter in batch {
                if seen.insert(chapter.id.clone()) {
                    chapters.push(chapter);
                    added = true;
                }
            }

            if !added {
                break;
            }
        }

        chapters.sort_by(|a, b| b.number.total_cmp(&a.number));
        Ok(chapters)
    }
}

impl Source for WebtoonsSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "com.webtoons.en".into(),
            name: "WEBTOON".into(),
            version: "1.0".into(),
            language: "en".into(),
            base_url: DOMAIN.into(),
            icon_url: Some("https://webtoons-static.pstatic.net/image/favicon/favicon.ico".into()),
            nsfw: false,
            hosts: vec![
                "webtoons.com".into(),
                "*.webtoons.com".into(),
                // Covers, episode thumbnails and page images all live on Naver's
                // image CDN under several subdomains (`webtoon-phinf`,
                // `swebtoon-phinf`, `webtoons-static`).
                "*.pstatic.net".into(),
            ],
        }
    }

    fn rate_limits(&self) -> Vec<RateLimit> {
        // Official Naver infrastructure and comfortably the sturdiest site in
        // the pack, which matters because one episode list can be 60+ requests.
        vec![
            RateLimit::per_second(SourceMethod::Homepage, 3),
            RateLimit::per_second(SourceMethod::Search, 3),
            RateLimit::per_second(SourceMethod::Section, 3),
            RateLimit::per_second(SourceMethod::Manga, 3),
            RateLimit::per_second(SourceMethod::Chapters, 5),
            RateLimit::per_second(SourceMethod::Pages, 3),
        ]
    }

    fn filters(&self) -> Vec<Filter> {
        let mut filters = vec![
            Filter::select(
                "type",
                "Collection",
                SelectOption::list([("originals", "Originals"), ("canvas", "Canvas")]),
            )
            .with_default("originals"),
        ];

        if let Ok(html) = guest::get_text(&format!("{DOMAIN}/en/genres"))
            && let Ok(genres) = parser::parse_genres(&html)
            && !genres.is_empty()
        {
            filters.push(Filter::select("genre", "Genre", genres));
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let originals = guest::get_text(&format!("{DOMAIN}/en/originals"))?;
        let canvas = guest::get_text(&canvas_list_url(1))?;

        Ok(Homepage {
            sections: vec![
                HomepageSection {
                    id: "originals".into(),
                    title: "Originals".into(),
                    layout: SectionLayout::SingleRow,
                    items: parser::parse_cards(&originals)?,
                    // `/en/originals` renders the whole catalogue in one
                    // response, so there is no second page to fetch.
                    paginable: false,
                },
                HomepageSection {
                    id: "canvas".into(),
                    title: "Canvas".into(),
                    layout: SectionLayout::TripleRow,
                    items: parser::parse_cards(&canvas)?,
                    paginable: true,
                },
            ],
        })
    }

    fn section(&self, section: SectionRef) -> SourceResult<MangaPage> {
        match section.section_id.as_str() {
            "canvas" => {
                let page = section.page.max(1);
                let html = guest::get_text(&canvas_list_url(page))?;
                parser::parse_listing(&html, page)
            }
            other => Err(SourceError::Parse {
                message: format!("section `{other}` is not paginable"),
            }),
        }
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let filters = query.filters.as_slice();
        let page = query.page.max(1);
        let term = query.term.trim();

        // Keyword search and genre browsing are separate endpoints and neither
        // takes the other's parameters, so a term wins when present and the
        // genre filter only applies while browsing.
        let collection = filters.select("type").unwrap_or("originals");

        let url = if term.is_empty() {
            match filters.select("genre") {
                // Genre browsing only covers Originals; Canvas has no
                // per-genre listing that renders usable cards.
                Some(genre) if !genre.is_empty() => format!("{DOMAIN}/en/genres/{genre}"),
                _ if collection == "canvas" => canvas_list_url(page),
                _ => format!("{DOMAIN}/en/originals"),
            }
        } else {
            format!(
                "{DOMAIN}/en/search/{collection}?keyword={}&page={page}",
                encode_query(term)
            )
        };

        let html = guest::get_text(&url)?;
        parser::parse_listing(&html, page)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let series = SeriesId::parse(&manga.manga_id)?;
        let html = guest::get_text(&series.list_url(DOMAIN, 1))?;
        parser::parse_manga_details(&html, &manga.manga_id)
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        self.all_episodes(&manga.manga_id)
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let series = SeriesId::parse(&chapter.manga_id)?;
        let html = guest::get_text(&series.viewer_url(DOMAIN, &chapter.chapter_id))?;
        parser::parse_viewer_pages(&html)
    }
}
