use serde::{Deserialize, Serialize};
use std::time::Duration;

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
#[derive(Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageCacheLimit {
    Off,
    Mb256,
    #[default]
    Mb512,
    Gb1,
    Gb2,
}

impl ImageCacheLimit {
    pub fn bytes(self) -> Option<u64> {
        let megabytes = match self {
            ImageCacheLimit::Off => return None,
            ImageCacheLimit::Mb256 => 256,
            ImageCacheLimit::Mb512 => 512,
            ImageCacheLimit::Gb1 => 1024,
            ImageCacheLimit::Gb2 => 2048,
        };
        Some(megabytes * 1024 * 1024)
    }
}

/// How long unlocking a locked category keeps it open.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CategoryLockSession {
    #[default]
    UntilAppCloses,
    UntilLeave,
    IdleTimeout,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemSettings {
    pub update_on_startup: bool,
    pub background_updates: UpdateInterval,
    pub confirm_removal: bool,
    pub enable_notifications: bool,
    pub image_cache_limit: ImageCacheLimit,
    pub category_lock_session: CategoryLockSession,
    pub category_lock_idle_minutes: u32,
    pub developer_mode: bool,
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            update_on_startup: true,
            background_updates: UpdateInterval::Off,
            confirm_removal: true,
            enable_notifications: true,
            image_cache_limit: ImageCacheLimit::default(),
            category_lock_session: CategoryLockSession::default(),
            category_lock_idle_minutes: 5,
            developer_mode: false,
        }
    }
}
