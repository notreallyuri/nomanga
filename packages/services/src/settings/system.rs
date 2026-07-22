use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemSettings {
    pub update_on_startup: bool,
    pub confirm_removal: bool,
    pub enable_notifications: bool,
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            update_on_startup: true,
            confirm_removal: true,
            enable_notifications: true,
        }
    }
}
