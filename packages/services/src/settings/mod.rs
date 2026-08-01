use crate::error::ServiceResult;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub mod appearance;
pub mod browse;
pub mod reader;
pub mod sidebar;
pub mod system;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub appearance: appearance::AppearanceSettings,
    pub browse: browse::BrowseSettings,
    pub reader: reader::ReaderSettings,
    pub sidebar: sidebar::SidebarSettings,
    pub system: system::SystemSettings,
}

pub fn load(path: &Path) -> ServiceResult<Settings> {
    match std::fs::read_to_string(path) {
        Ok(text) => {
            let mut settings: Settings = serde_json::from_str(&text)?;
            settings.sidebar.pinned_sources = settings.sidebar.pinned();
            settings.browse.source_order = settings.browse.order();
            Ok(settings)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn save(path: &Path, settings: &Settings) -> ServiceResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(settings)?;
    let tmp = path.with_extension("json.tmp");

    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;

    Ok(())
}
