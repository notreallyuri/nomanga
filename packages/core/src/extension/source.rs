use crate::data::chapter::{Chapter, Page};
use crate::data::homepage::Homepage;
use crate::data::manga::Manga;
use crate::extension::config::Setting;
use crate::extension::error::{SourceError, SourceResult};
use crate::extension::filter::Filter;
use crate::extension::query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef};
use crate::extension::rate_limit::RateLimit;
use serde::{Deserialize, Serialize};

// Bump on any change to the guest-facing surface: exported functions, host
// functions the guest imports, or the shape of the types crossing the boundary.
pub const ABI_VERSION: u32 = 6;

// Raise to ABI_VERSION only when a change breaks extensions built against the
// older ABI; leave it alone for additive ones. Adding a struct field is additive
// only if it carries #[serde(default)] — without that, deserializing an older
// extension's payload fails and the change is breaking.
pub const ABI_MIN_SUPPORTED: u32 = 5;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub language: String,
    pub base_url: String,
    pub icon_url: Option<String>,
    pub hosts: Vec<String>,
    pub nsfw: bool,
    // Additive: an ABI 5 extension emits no `challenge` and reads as None, which
    // is why ABI_MIN_SUPPORTED stays at 5.
    #[serde(default)]
    pub challenge: Option<Challenge>,
}

/// An interstitial the user has to clear in a real browser before the source
/// answers — Cloudflare's managed challenge being the case this exists for.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Challenge {
    /// Page to open. Not necessarily `base_url`: the challenge is often
    /// route-scoped, so this should be one of the routes that actually 403s.
    pub url: String,
    /// Cookies to harvest once the challenge clears, e.g. `cf_clearance`. They
    /// are HttpOnly, so nothing script-side can read them back.
    pub cookies: Vec<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Sourced<T> {
    pub source_id: String,
    pub payload: T,
}

pub trait Source {
    fn info(&self) -> SourceInfo;

    fn filters(&self) -> Vec<Filter> {
        Vec::new()
    }
    fn settings(&self) -> Vec<Setting> {
        Vec::new()
    }
    fn rate_limits(&self) -> Vec<RateLimit> {
        Vec::new()
    }
    fn homepage(&self) -> SourceResult<Homepage>;
    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage>;
    fn section(&self, _section: SectionRef) -> SourceResult<MangaPage> {
        Err(SourceError::NotFound {
            message: "".to_owned(),
        })
    }
    fn manga(&self, manga: MangaRef) -> SourceResult<Manga>;
    fn chapters(&self, manga: MangaRef) -> SourceResult<Vec<Chapter>>;
    fn pages(&self, chapter: ChapterRef) -> SourceResult<Vec<Page>>;
}
