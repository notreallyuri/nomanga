pub(super) mod api;

use std::collections::HashMap;

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

const API: &str = "https://api.mangadex.org";
const PAGE_SIZE: u32 = 32;
const FEED_PAGE_SIZE: u32 = 500;

pub struct MangaDexSource;

impl Source for MangaDexSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "org.mangadex".into(),
            name: "MangaDex".into(),
            version: "1.0".to_owned(),
            language: "multi".into(),
            base_url: "https://mangadex.org".into(),
            icon_url: Some("https://mangadex.org/favicon.ico".into()),
            hosts: vec!["api.mangadex.org".into()],
            nsfw: false,
        }
    }

    fn rate_limits(&self) -> Vec<RateLimit> {
        vec![
            RateLimit::per_second(SourceMethod::Search, 5),
            RateLimit::per_second(SourceMethod::Homepage, 5),
            RateLimit::per_second(SourceMethod::Chapters, 5),
        ]
    }

    fn settings(&self) -> Vec<Setting> {
        let mut settings = vec![
            Setting::select(
                "language",
                "Preferred language",
                SelectOption::list([
                    ("en", "English"),
                    ("pt-br", "Português (Brasil)"),
                    ("es-la", "Español (LatAm)"),
                    ("ja", "日本語"),
                    ("ko", "한국어"),
                    ("zh", "中文"),
                ]),
            )
            .with_description("Chapters and titles prefer this language."),
            Setting::multi_select(
                "content_rating",
                "Content ratings",
                SelectOption::list([
                    ("safe", "Safe"),
                    ("suggestive", "Suggestive"),
                    ("erotica", "Erotica"),
                    ("pornographic", "Pornographic"),
                ]),
            )
            .with_description("Which ratings appear in results. Defaults to safe and suggestive."),
            Setting::toggle("data_saver", "Data saver", false)
                .with_description("Load compressed page images. Faster, lower quality."),
            Setting::number("chapter_limit", "Chapters per request", 500)
                .with_description("Lower this if the chapter list times out on long series."),
            Setting::secret("session_token", "Session token")
                .with_description("Optional. Raises rate limits and enables personal lists."),
        ];

        if let Ok(tags) = fetch_tag_options() {
            settings.push(
                Setting::multi_select("excluded_tags", "Excluded tags", tags.clone())
                    .with_description("Series with any of these tags are hidden from results."),
            );
            settings.push(
                Setting::multi_select("included_tags", "Required tags", tags)
                    .with_description("Only show series carrying all of these tags."),
            );
        }

        settings
    }

    fn filters(&self) -> Vec<Filter> {
        let mut filters = vec![
            Filter::sort(
                "order",
                "Sort",
                SelectOption::list([
                    ("relevance", "Relevance"),
                    ("followedCount", "Popularity"),
                    ("latestUploadedChapter", "Latest upload"),
                    ("createdAt", "Recently added"),
                    ("year", "Year"),
                    ("title", "Title"),
                ]),
            )
            .with_default("relevance")
            .reversible(),
            Filter::multi_select(
                "status",
                "Status",
                SelectOption::list([
                    ("ongoing", "Ongoing"),
                    ("completed", "Completed"),
                    ("hiatus", "Hiatus"),
                    ("cancelled", "Cancelled"),
                ]),
            ),
            Filter::multi_select(
                "demographic",
                "Demographic",
                SelectOption::list([
                    ("shounen", "Shounen"),
                    ("shoujo", "Shoujo"),
                    ("seinen", "Seinen"),
                    ("josei", "Josei"),
                ]),
            ),
            Filter::multi_select(
                "original_language",
                "Original language",
                SelectOption::list([
                    ("ja", "Japanese"),
                    ("ko", "Korean"),
                    ("zh", "Chinese (Simplified)"),
                    ("zh-hk", "Chinese (Traditional)"),
                    ("en", "English"),
                    ("id", "Indonesian"),
                    ("pt-br", "Portuguese (Brazil)"),
                    ("es", "Spanish"),
                ]),
            )
            .with_exclusion(),
            Filter::text("year", "Year").with_placeholder("e.g. 2019"),
            Filter::toggle("has_chapters", "Has available chapters", true),
        ];

        if let Ok(groups) = fetch_tag_groups() {
            for (group, label) in [
                ("content", "Content warnings"),
                ("format", "Format"),
                ("genre", "Genre"),
                ("theme", "Theme"),
            ] {
                if let Some(options) = groups.get(group) {
                    if options.is_empty() {
                        continue;
                    }
                    filters.push(
                        Filter::multi_select(&format!("tag_{group}"), label, options.clone())
                            .with_exclusion(),
                    );
                }
            }
        }

        filters
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        let popular = fetch_manga_page(&format!(
            "{API}/manga?limit={PAGE_SIZE}&order[followedCount]=desc&{}",
            base_params()
        ))?;

        let latest = fetch_manga_page(&format!(
            "{API}/manga?limit={PAGE_SIZE}&order[latestUploadedChapter]=desc&{}",
            base_params()
        ))?;

        Ok(Homepage {
            sections: vec![
                HomepageSection {
                    id: "popular".into(),
                    title: "Popular".into(),
                    layout: SectionLayout::SingleRow,
                    items: popular.items,
                    paginable: true,
                },
                HomepageSection {
                    id: "latest".into(),
                    title: "Latest Updates".into(),
                    layout: SectionLayout::TripleRow,
                    items: latest.items,
                    paginable: true,
                },
            ],
        })
    }

    fn section(&self, section: SectionRef) -> SourceResult<MangaPage> {
        let order = match section.section_id.as_str() {
            "popular" => "followedCount",
            "latest" => "latestUploadedChapter",
            other => {
                return Err(SourceError::Parse {
                    message: format!("unknown section `{other}`"),
                });
            }
        };

        let offset = section.page.saturating_sub(1) * PAGE_SIZE;
        fetch_manga_page(&format!(
            "{API}/manga?limit={PAGE_SIZE}&offset={offset}&order[{order}]=desc&{}",
            base_params()
        ))
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let offset = query.page.saturating_sub(1) * PAGE_SIZE;

        let mut url = format!(
            "{API}/manga?limit={PAGE_SIZE}&offset={offset}&{}",
            base_params()
        );

        if !query.query.trim().is_empty() {
            url.push_str(&format!("&title={}", encode_query(&query.query)));
        }

        let filters = query.filters.as_slice();

        if let Some((value, reversed)) = filters.sort("order") {
            let dir = if reversed { "asc" } else { "desc" };
            url.push_str(&format!("&order[{value}]={dir}"));
        }

        if let Some(year) = filters.text("year")
            && let Ok(year) = year.trim().parse::<u32>()
        {
            url.push_str(&format!("&year={year}"));
        }

        if let Some(value) = filters.toggle("has_chapters") {
            url.push_str(&format!("&hasAvailableChapters={value}"));
        }

        push_all(&mut url, "status[]", filters.included("status"));
        push_all(
            &mut url,
            "publicationDemographic[]",
            filters.included("demographic"),
        );
        push_all(
            &mut url,
            "originalLanguage[]",
            filters.included("original_language"),
        );
        push_all(
            &mut url,
            "excludedOriginalLanguage[]",
            filters.excluded("original_language"),
        );

        for group in ["content", "format", "genre", "theme"] {
            let id = format!("tag_{group}");
            push_all(&mut url, "includedTags[]", filters.included(&id));
            push_all(&mut url, "excludedTags[]", filters.excluded(&id));
        }

        fetch_manga_page(&url)
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        let lang = guest::setting_or("language", "en");

        let res: api::Single<api::Manga> = guest::get_json(&format!(
            "{API}/manga/{}?includes[]=cover_art&includes[]=author&includes[]=artist",
            manga.manga_id
        ))?;

        let m = res.data;
        let attrs = &m.attributes;

        Ok(Manga {
            id: m.id.clone(),
            title: attrs.best_title(&lang),
            description: attrs.best_description(&lang),
            tags: attrs
                .tags
                .iter()
                .map(|t| Tag {
                    id: t.id.clone(),
                    label: t
                        .attributes
                        .name
                        .get("en")
                        .or_else(|| t.attributes.name.values().next())
                        .cloned()
                        .unwrap_or_default(),
                })
                .collect(),
            cover_url: m.cover_url(),
            author: m.people("author"),
            artist: m.people("artist"),
            status: match attrs.status.as_deref() {
                Some("ongoing") => Status::Ongoing,
                Some("completed") => Status::Completed,
                Some("hiatus") => Status::Hiatus,
                Some("cancelled") => Status::Cancelled,
                _ => Status::Unknown,
            },
            last_updated: String::new(),
            rating: None,
            views: None,
        })
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        let lang = guest::setting_or("language", "en");
        let limit = guest::setting_i32("chapter_limit", FEED_PAGE_SIZE as i32)
            .clamp(1, FEED_PAGE_SIZE as i32);

        let mut chapters = Vec::new();
        let mut offset = 0u32;

        loop {
            let res: api::List<api::Chapter> = guest::get_json(&format!(
                "{API}/manga/{}/feed?limit={limit}&offset={offset}\
                 &translatedLanguage[]={lang}&order[chapter]=desc\
                 &includes[]=scanlation_group&{}",
                manga.manga_id,
                content_rating_params()
            ))?;

            let fetched = res.data.len() as u32;

            for c in res.data {
                if c.attributes.external_url.is_some() {
                    continue;
                }

                let number = c
                    .attributes
                    .chapter
                    .as_deref()
                    .and_then(|s| s.parse::<f32>().ok())
                    .unwrap_or(0.0);

                let title = match (&c.attributes.chapter, &c.attributes.title) {
                    (Some(n), Some(t)) if !t.is_empty() => format!("Chapter {n} - {t}"),
                    (Some(n), _) => format!("Chapter {n}"),
                    (None, Some(t)) if !t.is_empty() => t.clone(),
                    _ => "Oneshot".to_owned(),
                };

                chapters.push(Chapter {
                    id: c.id.clone(),
                    title,
                    manga_id: manga.manga_id.clone(),
                    number,
                    volume: c
                        .attributes
                        .volume
                        .as_deref()
                        .and_then(|v| v.parse::<f32>().ok()),
                    language: c
                        .attributes
                        .translated_language
                        .unwrap_or_else(|| lang.clone()),
                    upload_date: c.attributes.publish_at.unwrap_or_default(),
                    page_count: c.attributes.pages,
                    scanlator: c
                        .relationships
                        .iter()
                        .find(|r| r.kind == "scanlation_group")
                        .and_then(|r| r.attributes.as_ref()?.name.clone()),
                    url: format!("https://mangadex.org/chapter/{}", c.id),
                    is_locked: false,
                });
            }

            offset += fetched;
            if fetched == 0 || offset >= res.total {
                break;
            }
        }

        Ok(chapters)
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let res: api::AtHome =
            guest::get_json(&format!("{API}/at-home/server/{}", chapter.chapter_id))?;

        let saver = guest::setting_bool("data_saver", false);
        let (quality, files) = if saver {
            ("data-saver", &res.chapter.data_saver)
        } else {
            ("data", &res.chapter.data)
        };

        Ok(files
            .iter()
            .enumerate()
            .map(|(i, file)| Page {
                number: i as u32,
                image_url: format!("{}/{quality}/{}/{file}", res.base_url, res.chapter.hash),
            })
            .collect())
    }
}

fn content_rating_params() -> String {
    let ratings = guest::setting_list("content_rating");
    let ratings: Vec<String> = if ratings.is_empty() {
        vec!["safe".into(), "suggestive".into()]
    } else {
        ratings
    };

    ratings
        .iter()
        .map(|r| format!("contentRating[]={r}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn base_params() -> String {
    let lang = guest::setting_or("language", "en");
    let mut params = format!(
        "includes[]=cover_art&availableTranslatedLanguage[]={lang}&{}",
        content_rating_params()
    );

    for tag in guest::setting_list("excluded_tags") {
        params.push_str(&format!("&excludedTags[]={tag}"));
    }
    for tag in guest::setting_list("included_tags") {
        params.push_str(&format!("&includedTags[]={tag}"));
    }

    params
}

fn fetch_manga_page(url: &str) -> SourceResult<MangaPage> {
    let lang = guest::setting_or("language", "en");
    let res: api::List<api::Manga> = guest::get_json(url)?;

    let has_next = res.offset + res.limit < res.total;

    Ok(MangaPage {
        items: res
            .data
            .into_iter()
            .map(|m| MangaSimple {
                title: m.attributes.best_title(&lang),
                cover_url: m.cover_url(),
                description: None,
                id: m.id,
            })
            .collect(),
        has_next,
    })
}

fn fetch_tag_options() -> SourceResult<Vec<SelectOption>> {
    let res: api::List<api::Tag> = guest::get_json(&format!("{API}/manga/tag"))?;

    let mut options: Vec<SelectOption> = res
        .data
        .into_iter()
        .map(|t| SelectOption {
            id: t.id,
            label: t
                .attributes
                .name
                .get("en")
                .or_else(|| t.attributes.name.values().next())
                .cloned()
                .unwrap_or_default(),
        })
        .filter(|o| !o.label.is_empty())
        .collect();

    options.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(options)
}

fn fetch_tag_groups() -> SourceResult<HashMap<String, Vec<SelectOption>>> {
    let res: api::List<api::Tag> = guest::get_json(&format!("{API}/manga/tag"))?;

    let mut groups: HashMap<String, Vec<SelectOption>> = HashMap::new();

    for tag in res.data {
        let label = tag
            .attributes
            .name
            .get("en")
            .or_else(|| tag.attributes.name.values().next())
            .cloned()
            .unwrap_or_default();

        if label.is_empty() {
            continue;
        }

        let group = tag.attributes.group.unwrap_or_else(|| "other".to_owned());
        groups
            .entry(group)
            .or_default()
            .push(SelectOption { id: tag.id, label });
    }

    for options in groups.values_mut() {
        options.sort_by(|a, b| a.label.cmp(&b.label));
    }

    Ok(groups)
}

fn push_all(url: &mut String, param: &str, values: &[String]) {
    for value in values {
        url.push_str(&format!("&{param}={}", encode_query(value)));
    }
}
