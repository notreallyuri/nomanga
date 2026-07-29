use crate::settings::Settings;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

mod export;
mod file;
mod import;
pub mod rows;

#[cfg(test)]
mod test;

pub use export::export;
pub use file::{read_file, write_file};
pub use import::import;
use rows::{
    CategoryRow, EntryCategoryRow, LibraryEntryRow, MangaRow, ProgressRow, ReadChapterRow,
    ReaderOverrideRow, RepositoryRow, SourcePreferenceRow, SourceSettingRow,
};

pub const VERSION: u32 = 1;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImportMode {
    Merge,
    Replace,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportReport {
    pub entries: u32,
    pub categories: u32,
    pub read_chapters: u32,
    pub progress: u32,
    pub missing_extensions: Vec<ExtensionRef>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionRef {
    pub id: String,
    pub version: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Backup {
    pub version: u32,
    pub created_at: DateTime<Utc>,
    pub app_version: String,
    pub settings: Settings,
    pub extensions: Vec<ExtensionRef>,
    pub manga: Vec<MangaRow>,
    pub library: Vec<LibraryEntryRow>,
    pub categories: Vec<CategoryRow>,
    pub entry_categories: Vec<EntryCategoryRow>,
    pub read_chapters: Vec<ReadChapterRow>,
    pub progress: Vec<ProgressRow>,
    pub source_preferences: Vec<SourcePreferenceRow>,
    pub source_settings: Vec<SourceSettingRow>,
    pub reader_overrides: Vec<ReaderOverrideRow>,
    // Added after VERSION 1 shipped; defaulting keeps older backups readable
    // rather than forcing a version bump for an additive field.
    #[serde(default)]
    pub repositories: Vec<RepositoryRow>,
}
