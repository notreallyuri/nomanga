pub(super) mod parser;
pub(super) mod util;

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

const DOMAIN: &str = "https://mangapill.com";

pub struct MangaPillSource;

impl Source for MangaPillSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "com.mangapill.en".into(),
            name: "MangaPill".into(),
            version: "1.0".into(),
            language: "en".into(),
            base_url: DOMAIN.into(),
            icon_url: Some(format!("{DOMAIN}/static/favicon/apple-touch-icon.png")),
            nsfw: false,
            hosts: vec![
                "mangapill.com".into(),
                "*.mangapill.com".into(),
                "*.readdetectiveconan.com".into(),
            ],
        }
    }

    fn rate_limits(&self) -> Vec<RateLimit> {
        vec![
            RateLimit::per_second(SourceMethod::Homepage, 2),
            RateLimit::per_second(SourceMethod::Search, 2),
            RateLimit::per_second(SourceMethod::Manga, 2),
            RateLimit::per_second(SourceMethod::Chapters, 2),
            RateLimit::per_second(SourceMethod::Pages, 2),
        ]
    }

    fn filters(&self) -> Vec<Filter> {
        let mut filters = vec![
            Filter::select(
                "type",
                "Type",
                SelectOption::list([
                    ("", "Any"),
                    ("manga", "Manga"),
                    ("manhua", "Manhua"),
                    ("novel", "Novel"),
                    ("one-shot", "One-shot"),
                    ("doujinshi", "Doujinshi"),
                    ("oel", "OEL"),
                ]),
            )
            .with_default(""),
            Filter::select(
                "status",
                "Status",
                SelectOption::list([
                    ("", "Any"),
                    ("publishing", "Publishing"),
                    ("finished", "Finished"),
                    ("on hiatus", "On hiatus"),
                    ("discontinued", "Discontinued"),
                    ("not yet published", "Not yet published"),
                ]),
            )
            .with_default(""),
        ];

        if let Ok(html) = guest::get_text(&format!("{DOMAIN}/search"))
            && let Ok(genres) = parser::parse_genres(&html)
            && !genres.is_empty()
        {
            filters.push(Filter::multi_select("genre", "Genres", genres));
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let trending_html = guest::get_text(DOMAIN)?;
        let new_html = guest::get_text(&format!("{DOMAIN}/mangas/new"))?;

        Ok(Homepage {
            sections: vec![
                HomepageSection {
                    id: "trending".into(),
                    title: "Trending".into(),
                    layout: SectionLayout::SingleRow,
                    items: parser::parse_cards(&trending_html)?,
                    // Neither landing page renders a pager — `?page=` is ignored
                    // outside of search — so there is nothing more to fetch.
                    paginable: false,
                },
                HomepageSection {
                    id: "recently-added".into(),
                    title: "Recently Added".into(),
                    layout: SectionLayout::TripleRow,
                    items: parser::parse_cards(&new_html)?,
                    paginable: false,
                },
            ],
        })
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let filters = query.filters.as_slice();

        let mut url = format!(
            "{DOMAIN}/search?q={}&page={}",
            encode_query(&query.term),
            query.page.max(1),
        );

        for id in ["type", "status"] {
            if let Some(value) = filters.select(id)
                && !value.is_empty()
            {
                url.push_str(&format!("&{id}={}", encode_query(value)));
            }
        }

        for genre in filters.included("genre") {
            url.push_str(&format!("&genre={}", encode_query(genre)));
        }

        let html = guest::get_text(&url)?;
        parser::parse_search(&html)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let html = guest::get_text(&format!("{DOMAIN}/manga/{}", manga.manga_id))?;
        parser::parse_manga_details(&html, &manga.manga_id)
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        // The full chapter list ships with the detail page; there is no
        // separate endpoint to hit.
        let html = guest::get_text(&format!("{DOMAIN}/manga/{}", manga.manga_id))?;
        parser::parse_chapter_list(&html, &manga.manga_id)
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let html = guest::get_text(&format!("{DOMAIN}/chapters/{}", chapter.chapter_id))?;
        parser::parse_chapter_pages(&html)
    }
}
