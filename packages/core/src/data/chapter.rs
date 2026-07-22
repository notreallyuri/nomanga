use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Page {
    pub number: u32,
    pub image_url: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub manga_id: String,
    pub number: f32,
    pub volume: Option<f32>,
    pub language: String,
    pub upload_date: String,
    pub page_count: Option<u32>,
    pub scanlator: Option<String>,
    pub url: String,
    pub is_locked: bool,
}
