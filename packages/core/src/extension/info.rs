use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub abi_version: u32,
    pub author: String,
    pub website: Option<String>,
}
