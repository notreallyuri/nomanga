use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Tag {
    pub id: String,
    pub label: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Status {
    Ongoing,
    Completed,
    Hiatus,
    Cancelled,
    Unknown,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Manga {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<Tag>,
    pub cover_url: String,
    pub author: Vec<String>,
    pub artist: Vec<String>,
    pub status: Status,
    pub last_updated: String,
    pub rating: Option<f32>,
    #[cfg_attr(feature = "typescript", specta(type = specta_typescript::BigInt))]
    pub views: Option<u64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MangaSimple {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: String,
}
