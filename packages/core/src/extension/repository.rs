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

#[cfg(test)]
mod tests {
    use super::*;

    /// The README documents this shape and says it can be written by hand, so
    /// the smallest legal index is worth pinning: optional fields omitted
    /// entirely, not spelled as null.
    #[test]
    fn parses_a_hand_written_index() {
        let index: RepositoryIndex = serde_json::from_str(
            r#"{
              "index_version": 1,
              "name": "My pack",
              "extensions": [{
                "info": {
                  "id": "dev.you.mypack", "name": "My Pack", "version": "0.1.0",
                  "abi_version": 5, "author": "you", "website": null
                },
                "download_url": "my_pack.wasm",
                "sources": [{
                  "id": "com.example.en", "name": "Example", "version": "1.0",
                  "language": "en", "base_url": "https://example.org",
                  "icon_url": null, "hosts": ["example.org"], "nsfw": false
                }]
              }]
            }"#,
        )
        .unwrap();

        assert_eq!(index.name, "My pack");
        assert!(index.description.is_none());
        assert_eq!(index.extensions[0].download_url, "my_pack.wasm");
        assert_eq!(index.extensions[0].sources[0].hosts, ["example.org"]);
    }
}
