use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::ServiceResult;

pub mod appearance;
pub mod reader;
pub mod system;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub appearance: appearance::AppearanceSettings,
    pub reader: reader::ReaderSettings,
    pub system: system::SystemSettings,
}

pub fn load(path: &Path) -> ServiceResult<Settings> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
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
