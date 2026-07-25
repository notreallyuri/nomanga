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
    prelude::{FilterValues, SectionRef, SelectOption, SourceError},
};

const DOMAIN: &str = "https://weebcentral.com";
const PAGE_SIZE: u32 = 32;

pub struct WeebCentralSource;

impl Source for WeebCentralSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "com.weebcentral.en".into(),
            name: "Weeb Central".into(),
            version: "1.0".into(),
            language: "en".into(),
            base_url: "https://weebcentral.com".into(),
            nsfw: false,
            icon_url: Some(format!("{DOMAIN}/favicon.ico")),
            hosts: vec![
                "weebcentral.com".into(),
                "*.weebcentral.com".into(),
                "*.compsci88.com".into(),
            ],
        }
    }

    fn filters(&self) -> Vec<Filter> {
        let toggle3 = || SelectOption::list(["Any", "True", "False"]);

        let mut filters = vec![
            Filter::sort(
                "sort",
                "Sort",
                SelectOption::list([
                    "Best Match",
                    "Alphabet",
                    "Popularity",
                    "Subscribers",
                    "Recently Added",
                    "Latest Updates",
                ]),
            )
            .with_default("Best Match"),
            Filter::select(
                "order",
                "Order",
                SelectOption::list(["Ascending", "Descending"]),
            )
            .with_default("Descending"),
            Filter::select("official", "Official Translation", toggle3()).with_default("Any"),
            Filter::select("anime", "Anime Adaptation", toggle3()).with_default("Any"),
            Filter::select("adult", "Adult Content", toggle3()).with_default("Any"),
            Filter::multi_select(
                "included_status",
                "Series Status",
                SelectOption::list(["Ongoing", "Complete", "Hiatus", "Canceled"]),
            ),
            Filter::multi_select(
                "included_type",
                "Series Type",
                SelectOption::list(["Manga", "Manhwa", "Manhua", "OEL"]),
            ),
        ];

        if let Ok(html) = guest::get_text(&format!("{DOMAIN}/search"))
            && let Ok(tags) = parser::parse_tags(&html)
        {
            filters.push(Filter::multi_select("tags", "Tags", tags).with_exclusion());
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let hot_html = guest::get_text(DOMAIN)?;
        let latest_html = guest::get_text(&format!("{DOMAIN}/latest-updates/1"))?;

        Ok(Homepage {
            sections: vec![
                parser::parse_latest_updates(&latest_html)?,
                parser::parse_hot_updates(&hot_html)?,
            ],
        })
    }

    fn section(&self, section: SectionRef) -> SourceResult<MangaPage> {
        match section.section_id.as_str() {
            "latest-updates" => {
                let html = guest::get_text(&format!("{DOMAIN}/latest-updates/{}", section.page))?;
                let parsed = parser::parse_latest_updates(&html)?;
                Ok(MangaPage {
                    items: parsed.items,
                    has_next: true,
                })
            }
            other => Err(SourceError::Parse {
                message: format!("section `{other}` is not paginable"),
            }),
        }
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let offset = query.page.saturating_sub(1) * PAGE_SIZE;

        let mut url = format!(
            "{DOMAIN}/search/data?limit={PAGE_SIZE}&offset={offset}&text={}&display_mode=Full+Display",
            encode_query(&query.query),
        );

        let filters = query.filters.as_slice();

        if let Some((value, _)) = filters.sort("sort") {
            url.push_str(&format!("&sort={}", encode_query(value)));
        }

        for id in ["order", "official", "anime", "adult"] {
            if let Some(value) = filters.select(id) {
                url.push_str(&format!("&{id}={}", encode_query(value)));
            }
        }

        for id in ["included_status", "included_type"] {
            for value in filters.included(id) {
                url.push_str(&format!("&{id}={}", encode_query(value)));
            }
        }

        for tag in filters.included("tags") {
            url.push_str(&format!("&included_tag={}", encode_query(tag)));
        }
        for tag in filters.excluded("tags") {
            url.push_str(&format!("&excluded_tag={}", encode_query(tag)));
        }

        let html = guest::get_text(&url)?;
        parser::parse_search(&html)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let html = guest::get_text(&format!("{DOMAIN}/series/{}", manga.manga_id))?;
        parser::parse_manga_details(&html, &manga.manga_id)
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        let html = guest::get_text(&format!(
            "{DOMAIN}/series/{}/full-chapter-list",
            manga.manga_id
        ))?;
        parser::parse_chapter_list(&html, &manga.manga_id)
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let html = guest::get_text(&format!("{DOMAIN}/chapters/{}", chapter.chapter_id))?;
        parser::parse_chapter_pages(&html)
    }
}
