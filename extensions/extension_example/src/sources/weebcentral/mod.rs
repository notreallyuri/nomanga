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
    parse::{encode_path, encode_query},
    prelude::{FilterValue, SectionRef, SelectOption, SourceError},
};

const BASE: &str = "https://weebcentral.com";

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
            icon_url: Some(format!("{BASE}/favicon.ico")),
            hosts: vec![
                "weebcentral.com".into(),
                "*.weebcentral.com".into(),
                "*.compsci88.com".into(),
            ],
        }
    }

    fn filters(&self) -> Vec<Filter> {
        let mut filters = vec![
            Filter::Sort {
                id: "sort".into(),
                label: "Sort".into(),
                options: opts(&[
                    "Best Match",
                    "Alphabet",
                    "Popularity",
                    "Subscribers",
                    "Recently Added",
                    "Latest Updates",
                ]),
                can_reverse: false,
                default: Some("Best Match".into()),
            },
            Filter::Select {
                id: "order".into(),
                label: "Order".into(),
                options: opts(&["Ascending", "Descending"]),
                default: Some("Descending".into()),
            },
            Filter::Select {
                id: "official".into(),
                label: "Official Translation".into(),
                options: opts(&["Any", "True", "False"]),
                default: Some("Any".into()),
            },
            Filter::Select {
                id: "anime".into(),
                label: "Anime Adaptation".into(),
                options: opts(&["Any", "True", "False"]),
                default: Some("Any".into()),
            },
            Filter::Select {
                id: "adult".into(),
                label: "Adult Content".into(),
                options: opts(&["Any", "True", "False"]),
                default: Some("Any".into()),
            },
            Filter::MultiSelect {
                id: "included_status".into(),
                label: "Series Status".into(),
                options: opts(&["Ongoing", "Complete", "Hiatus", "Canceled"]),
                supports_exclusion: false,
            },
            Filter::MultiSelect {
                id: "included_type".into(),
                label: "Series Type".into(),
                options: opts(&["Manga", "Manhwa", "Manhua", "OEL"]),
                supports_exclusion: false,
            },
        ];

        if let Ok(html) = guest::get_text(&format!("{BASE}/search"))
            && let Ok(tags) = parser::parse_tags(&html)
        {
            filters.push(Filter::MultiSelect {
                id: "tags".into(),
                label: "Tags".into(),
                options: tags,
                supports_exclusion: true,
            })
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let hot_html = guest::get_text(BASE)?;
        let latest_html = guest::get_text(&format!("{BASE}/latest-updates/1"))?;

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
                let html = guest::get_text(&format!("{BASE}/latest-updates/{}", section.page))?;
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
        let mut url = format!(
            "{BASE}/search/data?text={}&page={}&display_mode=Full+Display",
            encode_query(&query.query),
            query.page
        );

        for f in &query.filters {
            match f {
                FilterValue::Sort { id, value, .. } if id == "sort" => {
                    url.push_str(&format!("&sort={}", encode_query(value)));
                }
                FilterValue::Select { id, value }
                    if matches!(id.as_str(), "order" | "official" | "anime" | "adult") =>
                {
                    url.push_str(&format!("&{id}={}", encode_query(value)));
                }
                FilterValue::MultiSelect {
                    id,
                    included,
                    excluded,
                } if id == "tags" => {
                    for t in included {
                        url.push_str(&format!("&included_tag={}", encode_query(t)));
                    }
                    for t in excluded {
                        url.push_str(&format!("&excluded_tag={}", encode_query(t)));
                    }
                }
                FilterValue::MultiSelect { id, included, .. }
                    if id == "included_status" || id == "included_type" =>
                {
                    for v in included {
                        url.push_str(&format!("&{id}={}", encode_query(v)));
                    }
                }
                _ => {}
            }
        }

        let html = guest::get_text(&url)?;
        parser::parse_search(&html)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let html = guest::get_text(&format!("{BASE}/series/{}", manga.manga_id))?;
        parser::parse_manga_details(&html, &manga.manga_id)
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        let html = guest::get_text(&format!(
            "{BASE}/series/{}/full-chapter-list",
            manga.manga_id
        ))?;
        parser::parse_chapter_list(&html, &manga.manga_id)
    }

    fn pages(&self, _chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        todo!("needs /chapter-pages/ implementation")
    }
}

fn opts(labels: &[&str]) -> Vec<SelectOption> {
    labels
        .iter()
        .map(|s| SelectOption {
            id: (*s).into(),
            label: (*s).into(),
        })
        .collect()
}
