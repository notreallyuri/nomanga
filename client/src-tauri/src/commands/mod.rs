pub mod extension;
pub mod history;
pub mod library;
pub mod settings;
pub mod source;
pub mod startup;

use serde::{Deserialize, Serialize};

/// Emitted once per series while a library refresh runs, so the UI can show a
/// determinate progress bar. A final event with `done == total` marks the end.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct LibraryRefreshProgress {
    pub done: u32,
    pub total: u32,
    pub current_title: String,
}
