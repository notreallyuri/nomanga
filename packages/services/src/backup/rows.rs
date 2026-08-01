use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MangaRow {
    pub source_id: String,
    pub manga_id: String,
    pub title: String,
    pub cover_url: String,
    pub description: String,
    pub authors: String,
    pub artists: String,
    pub tags: String,
    pub status: String,
    pub cached_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryEntryRow {
    pub source_id: String,
    pub manga_id: String,
    pub added_at: String,
    pub cached_total_chapters: i64,
    pub last_checked_at: Option<String>,
    pub updates_cleared_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryRow {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub hidden: i64,
    pub locked: i64,
    pub is_default: i64,
    #[serde(default)]
    pub skip_updates: i64,
    pub sort_mode: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryCategoryRow {
    pub source_id: String,
    pub manga_id: String,
    pub category_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadChapterRow {
    pub source_id: String,
    pub manga_id: String,
    pub chapter_id: String,
    pub read_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressRow {
    pub source_id: String,
    pub manga_id: String,
    pub last_chapter_id: String,
    pub last_page: i64,
    pub last_chapter_done: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcePreferenceRow {
    pub source_id: String,
    pub enabled: i64,
    pub private: i64,
    pub blur_covers: i64,
    pub skip_updates: i64,
    // Added after the first backups were written, so an older archive that
    // predates the column still imports instead of failing the whole restore.
    #[serde(default)]
    pub hide_from_search: i64,
    pub default_category_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSettingRow {
    pub source_id: String,
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryRow {
    pub url: String,
    pub name: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderOverrideRow {
    pub source_id: String,
    pub manga_id: String,
    pub data: String,
}
