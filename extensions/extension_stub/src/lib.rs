//! A minimal example extension: one `Source` returning static data with no
//! network (empty `hosts`). Starting point for a real source — declare `hosts`,
//! then fetch and parse inside each method with the SDK's `guest` helpers.
//!
//! Build: cargo build -p extension_stub --release --target wasm32-unknown-unknown

use nomanga_sdk::prelude::*;

struct StubSource;

impl Source for StubSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "stub".into(),
            name: "Stub Source".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            language: "en".into(),
            base_url: "https://example.com".into(),
            icon_url: None,
            // Empty allow-list = no network. Add a real source's hosts here.
            hosts: Vec::new(),
            nsfw: false,
        }
    }

    fn homepage(&self) -> SourceResult<Homepage> {
        Ok(Homepage {
            sections: vec![HomepageSection {
                id: "featured".into(),
                title: "Featured".into(),
                layout: SectionLayout::SingleRow,
                items: vec![sample_listing()],
                paginable: false,
            }],
        })
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        // A real source queries its API here; this echoes one placeholder.
        let _ = query;
        Ok(MangaPage {
            items: vec![sample_listing()],
            has_next: false,
        })
    }

    fn manga(&self, manga: MangaRef) -> SourceResult<Manga> {
        Ok(Manga {
            id: manga.manga_id,
            title: "Stub Series".into(),
            description: "A placeholder series from the stub extension.".into(),
            tags: vec![Tag {
                id: "demo".into(),
                label: "Demo".into(),
            }],
            cover_url: SAMPLE_COVER.into(),
            author: vec!["Author Name".into()],
            artist: vec!["Artist Name".into()],
            status: Status::Ongoing,
            last_updated: String::new(),
            rating: None,
            views: None,
        })
    }

    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>> {
        let chapter = |number: f32| Chapter {
            id: format!("ch-{number}"),
            title: format!("Chapter {number}"),
            manga_id: manga.manga_id.clone(),
            number,
            volume: None,
            language: "en".into(),
            upload_date: String::new(),
            page_count: Some(2),
            scanlator: None,
            url: String::new(),
            is_locked: false,
        };
        // Newest first, matching how sources typically return chapter lists.
        Ok(vec![chapter(2.0), chapter(1.0)])
    }

    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>> {
        let _ = chapter;
        Ok(vec![
            Page {
                number: 1,
                image_url: SAMPLE_COVER.into(),
            },
            Page {
                number: 2,
                image_url: SAMPLE_COVER.into(),
            },
        ])
    }
}

const SAMPLE_COVER: &str = "https://placehold.co/300x450";

fn sample_listing() -> MangaSimple {
    MangaSimple {
        id: "stub-1".into(),
        title: "Stub Series".into(),
        description: Some("A placeholder series.".into()),
        cover_url: SAMPLE_COVER.into(),
    }
}

nomanga_sdk::register_sources! {
    extension: ExtensionInfo {
        id: "dev.nomanga.stub".into(),
        name: "Stub Pack".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        abi_version: ABI_VERSION,
        author: "nomanga".into(),
        website: None,
    },
    sources: [StubSource],
}
