use crate::data::manga::MangaSimple;
use crate::extension::filter::FilterValue;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchQuery {
    pub query: String,
    pub page: u32,
    #[serde(default)]
    pub filters: Vec<FilterValue>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MangaPage {
    pub items: Vec<MangaSimple>,
    pub has_next: bool,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MangaRef {
    pub manga_id: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SectionRef {
    pub section_id: String,
    pub page: u32,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChapterRef {
    pub manga_id: String,
    pub chapter_id: String,
}
