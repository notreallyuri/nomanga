use crate::extension::info::ExtensionInfo;
use crate::extension::source::{ABI_MIN_SUPPORTED, ABI_VERSION, SourceInfo};
use serde::{Deserialize, Serialize};

// Bump only when a change to the index shape cannot be read by an older app.
// New fields carrying #[serde(default)] are additive and do not need it.
pub const INDEX_VERSION: u32 = 1;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepositoryIndex {
    pub index_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
    pub extensions: Vec<RepositoryExtension>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepositoryExtension {
    pub info: ExtensionInfo,
    pub download_url: String,
    pub sources: Vec<SourceInfo>,
}

impl RepositoryExtension {
    /// Whether this app could load the extension, judged from the index alone
    /// so an entry can be flagged before anything is downloaded. The `.wasm`
    /// stays authoritative — a repository that publishes a wrong `abi_version`
    /// is caught again by `ExtensionMetadata::inspect` on install.
    pub fn abi_supported(&self) -> bool {
        let abi = self.info.abi_version;
        (ABI_MIN_SUPPORTED..=ABI_VERSION).contains(&abi)
    }
}
