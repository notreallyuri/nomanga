use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub mod backup;
pub mod cache;
pub mod debug;
pub mod db;
pub mod downloads;
pub mod error;
pub mod extension;
pub mod history;
pub mod library;
pub mod settings;
pub mod source;
pub mod sync;

pub(crate) fn now() -> DateTime<Utc> {
    Utc::now()
}

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
