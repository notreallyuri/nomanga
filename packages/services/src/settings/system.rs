use serde::{Deserialize, Serialize};
use std::time::Duration;

/// How often the app checks the library for new chapters in the background.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateInterval {
    #[default]
    Off,
    Every6Hours,
    Every12Hours,
    Every24Hours,
}

impl UpdateInterval {
    /// The interval between background checks, or `None` when disabled.
    pub fn duration(self) -> Option<Duration> {
        let hours = match self {
            UpdateInterval::Off => return None,
            UpdateInterval::Every6Hours => 6,
            UpdateInterval::Every12Hours => 12,
            UpdateInterval::Every24Hours => 24,
        };
        Some(Duration::from_secs(hours * 60 * 60))
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemSettings {
    pub update_on_startup: bool,
    pub background_updates: UpdateInterval,
    pub confirm_removal: bool,
    pub enable_notifications: bool,
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            update_on_startup: true,
            background_updates: UpdateInterval::Off,
            confirm_removal: true,
            enable_notifications: true,
        }
    }
}
