use serde::{Deserialize, Serialize};

pub mod db;
pub mod error;
pub mod history;
pub mod library;
pub mod preferences;
pub mod settings;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupWarning {
    pub kind: WarningKind,
    pub message: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WarningKind {
    SettingsCorrupt,
    ExtensionFailed,
}
