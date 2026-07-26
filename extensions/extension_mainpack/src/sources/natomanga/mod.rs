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
    prelude::*,
};

use util::search_slug;

const DOMAIN: &str = "https://www.natomanga.com";

/// The chapters API caps a response at its own page size, so long series need
/// several round trips. Each one is rate-limited, hence the ceiling: 20 pages is
/// 1000 chapters, past anything the site actually hosts.
const CHAPTER_PAGE_SIZE: u32 = 50;
const MAX_CHAPTER_PAGES: u32 = 20;

pub struct NatoMangaSource;

impl NatoMangaSource {
    fn chapters_via_api(&self, manga_id: &str) -> SourceResult<Vec<Chapter>> {
        let mut chapters = Vec::new();

        for page in 0..MAX_CHAPTER_PAGES {
            let url = format!(
                "{DOMAIN}/api/manga/{manga_id}/chapters?limit={CHAPTER_PAGE_SIZE}&offset={}",
                page * CHAPTER_PAGE_SIZE
            );

            let (batch, has_more) = parser::parse_chapters_api(&guest::get_text(&url)?, manga_id)?;
            chapters.extend(batch);

            if !has_more {
                break;
            }
        }

        Ok(chapters)
    }
}

impl Source for NatoMangaSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "com.natomanga.en".into(),
            name: "NatoManga".into(),
            version: "1.0".into(),
            language: "en".into(),
            base_url: DOMAIN.into(),
            icon_url: Some(format!("{DOMAIN}/favicon.ico")),
            nsfw: false,
            hosts: vec![
                "natomanga.com".into(),
                "*.natomanga.com".into(),
                // Covers and reader pages are sharded across two CDN domains
                // with per-series host assignment (img-r1/img-r2/imgs-2 and
                // storage/storage4), so both need wildcards rather than a
                // fixed list that breaks when a new shard appears.
                "2xstorage.com".into(),
                "*.2xstorage.com".into(),
                "waitst.com".into(),
                "*.waitst.com".into(),
            ],
        }
    }

    fn rate_limits(&self) -> Vec<RateLimit> {
        // The site sits behind Cloudflare and hard-challenges on the slightest
        // provocation, so this is deliberately the gentlest limit in the pack.
        vec![
            RateLimit::per_second(SourceMethod::Homepage, 1),
            RateLimit::per_second(SourceMethod::Search, 1),
            RateLimit::per_second(SourceMethod::Section, 1),
            RateLimit::per_second(SourceMethod::Manga, 1),
            RateLimit::per_second(SourceMethod::Chapters, 1),
            RateLimit::per_second(SourceMethod::Pages, 1),
        ]
    }

    fn filters(&self) -> Vec<Filter> {
        // Type and Status are two rows in the site's filter drawer but they
        // write the same `filter=` parameter, so only one can ever be active.
        // Collapsing them into one select keeps the UI honest about that.
        let mut filters = vec![
            Filter::select(
                "filter",
                "Sort & Status",
                SelectOption::list([
                    ("4", "Latest"),
                    ("1", "Newest"),
                    ("7", "Top read"),
                    ("5", "Completed"),
                    ("6", "Ongoing"),
                ]),
            )
            .with_default("4"),
        ];

        if let Ok(html) = guest::get_text(&format!("{DOMAIN}/genre/all"))
            && let Ok(genres) = parser::parse_genres(&html)
            && !genres.is_empty()
        {
            filters.push(Filter::select("genre", "Genre", genres).with_default("all"));
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let latest_html = guest::get_text(&format!("{DOMAIN}/manga-list/latest-manga"))?;
        let hot_html = guest::get_text(&format!("{DOMAIN}/manga-list/hot-manga"))?;

        Ok(Homepage {
            sections: vec![
                HomepageSection {
                    id: "hot-manga".into(),
                    title: "Hot Manga".into(),
                    layout: SectionLayout::SingleRow,
                    items: parser::parse_cards(&hot_html)?,
                    paginable: true,
                },
                HomepageSection {
                    id: "latest-manga".into(),
                    title: "Latest Updates".into(),
                    layout: SectionLayout::TripleRow,
                    items: parser::parse_cards(&latest_html)?,
                    paginable: true,
                },
            ],
        })
    }

    fn section(&self, section: SectionRef) -> SourceResult<MangaPage> {
        let list = match section.section_id.as_str() {
            id @ ("hot-manga" | "latest-manga") => id,
            other => {
                return Err(SourceError::Parse {
                    message: format!("section `{other}` is not paginable"),
                });
            }
        };

        let html = guest::get_text(&format!(
            "{DOMAIN}/manga-list/{list}?page={}",
            section.page.max(1)
        ))?;
        parser::parse_listing(&html)
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let filters = query.filters.as_slice();
        let page = query.page.max(1);
        let term = search_slug(&query.term);

        // Natomanga exposes text search and genre browsing as two different
        // endpoints, and neither accepts the other's parameters — a term plus a
        // genre is not expressible. A term wins when present; the genre filter
        // only applies while browsing.
        let url = if term.is_empty() {
            let genre = filters.select("genre").unwrap_or("all");
            let sort = filters.select("filter").unwrap_or("4");
            format!("{DOMAIN}/genre/{genre}?page={page}&filter={sort}")
        } else {
            format!("{DOMAIN}/search/story/{term}?page={page}")
        };

        let html = guest::get_text(&url)?;
        parser::parse_listing(&html)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let html = guest::get_text(&format!("{DOMAIN}/manga/{}", manga.manga_id))?;
        parser::parse_manga_details(&html, &manga.manga_id)
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        match self.chapters_via_api(&manga.manga_id) {
            Ok(chapters) if !chapters.is_empty() => Ok(chapters),
            // The detail page still pre-renders the newest 50, so a shape change
            // in the API costs recent chapters rather than the whole series.
            _ => {
                let html = guest::get_text(&format!("{DOMAIN}/manga/{}", manga.manga_id))?;
                parser::parse_chapter_list(&html, &manga.manga_id)
            }
        }
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let html = guest::get_text(&format!(
            "{DOMAIN}/manga/{}/{}",
            chapter.manga_id, chapter.chapter_id
        ))?;
        parser::parse_chapter_pages(&html)
    }
}
