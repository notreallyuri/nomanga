use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceMethod {
    Homepage,
    Search,
    Section,
    Manga,
    Chapters,
    Pages,
}

/// At most `requests` calls to `method` per `per_ms`. The host enforces it by
/// delaying calls that would exceed the budget, never dropping them.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RateLimit {
    pub method: SourceMethod,
    pub requests: u32,
    pub per_ms: u64,
}

impl RateLimit {
    pub fn new(method: SourceMethod, requests: u32, per_ms: u64) -> Self {
        Self {
            method,
            requests,
            per_ms,
        }
    }

    pub fn per_second(method: SourceMethod, requests: u32) -> Self {
        Self::new(method, requests, 1_000)
    }

    pub fn per_minute(method: SourceMethod, requests: u32) -> Self {
        Self::new(method, requests, 60_000)
    }
}
