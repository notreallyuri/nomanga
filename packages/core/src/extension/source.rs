use crate::data::chapter::{Chapter, Page};
use crate::data::homepage::Homepage;
use crate::data::manga::Manga;
use crate::extension::config::Setting;
use crate::extension::error::{SourceError, SourceResult};
use crate::extension::filter::Filter;
use crate::extension::query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef};
use serde::{Deserialize, Serialize};

pub const ABI_VERSION: u32 = 1;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub language: String,
    pub base_url: String,
    pub icon_url: Option<String>,
    pub hosts: Vec<String>,
    pub nsfw: bool,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Sourced<T> {
    pub source_id: String,
    pub payload: T,
}

pub trait Source {
    fn info(&self) -> SourceInfo;

    fn filters(&self) -> Vec<Filter> {
        Vec::new()
    }
    fn settings(&self) -> Vec<Setting> {
        Vec::new()
    }
    fn homepage(&self) -> SourceResult<Homepage>;
    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage>;
    fn section(&self, _section: SectionRef) -> SourceResult<MangaPage> {
        Err(SourceError::NotFound)
    }
    fn manga(&self, manga: MangaRef) -> SourceResult<Manga>;
    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>>;
    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>>;
}
