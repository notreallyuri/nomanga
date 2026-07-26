use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct List<T> {
    pub data: Vec<T>,
    pub total: u32,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Deserialize)]
pub struct Single<T> {
    pub data: T,
}

#[derive(Deserialize)]
pub struct Manga {
    pub id: String,
    pub attributes: MangaAttributes,
    #[serde(default)]
    pub relationships: Vec<Relationship>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaAttributes {
    pub title: HashMap<String, String>,
    #[serde(default)]
    pub description: HashMap<String, String>,
    #[serde(default)]
    pub tags: Vec<Tag>,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct Tag {
    pub id: String,
    pub attributes: TagAttributes,
}

#[derive(Deserialize)]
pub struct TagAttributes {
    pub name: HashMap<String, String>,
    pub group: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    #[serde(rename = "type")]
    pub kind: String,
    pub attributes: Option<RelationshipAttributes>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipAttributes {
    pub name: Option<String>,
    pub file_name: Option<String>,
}

#[derive(Deserialize)]
pub struct Chapter {
    pub id: String,
    pub attributes: ChapterAttributes,
    #[serde(default)]
    pub relationships: Vec<Relationship>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterAttributes {
    pub chapter: Option<String>,
    pub volume: Option<String>,
    pub title: Option<String>,
    pub translated_language: Option<String>,
    pub pages: Option<u32>,
    pub publish_at: Option<String>,
    pub external_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtHome {
    pub base_url: String,
    pub chapter: AtHomeChapter,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtHomeChapter {
    pub hash: String,
    pub data: Vec<String>,
    pub data_saver: Vec<String>,
}

impl MangaAttributes {
    pub fn best_title(&self, preferred: &str) -> String {
        self.title
            .get(preferred)
            .or_else(|| self.title.get("en"))
            .or_else(|| self.title.values().next())
            .cloned()
            .unwrap_or_else(|| "Untitled".to_owned())
    }

    pub fn best_description(&self, preferred: &str) -> String {
        self.description
            .get(preferred)
            .or_else(|| self.description.get("en"))
            .or_else(|| self.description.values().next())
            .cloned()
            .unwrap_or_default()
    }
}

impl Manga {
    pub fn cover_url(&self) -> String {
        self.relationships
            .iter()
            .find(|r| r.kind == "cover_art")
            .and_then(|r| r.attributes.as_ref())
            .and_then(|a| a.file_name.as_ref())
            .map(|f| {
                format!(
                    "https://uploads.mangadex.org/covers/{}/{f}.512.jpg",
                    self.id
                )
            })
            .unwrap_or_default()
    }

    pub fn people(&self, kind: &str) -> Vec<String> {
        self.relationships
            .iter()
            .filter(|r| r.kind == kind)
            .filter_map(|r| r.attributes.as_ref()?.name.clone())
            .collect()
    }
}
