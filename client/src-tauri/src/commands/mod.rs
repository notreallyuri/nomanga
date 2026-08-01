pub mod backup;
pub mod cache;
pub mod challenge;
pub mod debug;
pub mod downloads;
pub mod extension;
pub mod history;
pub mod library;
pub mod repository;
pub mod settings;
pub mod source;
pub mod startup;
pub mod sync;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct LibraryRefreshProgress {
    pub done: u32,
    pub total: u32,
    pub current_title: String,
}
