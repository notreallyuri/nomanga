use crate::error::{HostError, HostResult};
use extism::{Manifest, Plugin, Wasm, convert::Json};
use nomanga_core::extension::{
    config::Setting,
    filter::Filter,
    info::ExtensionInfo,
    rate_limit::RateLimit,
    source::{ABI_MIN_SUPPORTED, ABI_VERSION, SourceInfo, Sourced},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SourceSnapshot {
    pub info: SourceInfo,
    pub filters: Vec<Filter>,
    pub settings: Vec<Setting>,
    pub rate_limits: Vec<RateLimit>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtensionSnapshot {
    pub extension: ExtensionInfo,
    pub sources: Vec<SourceSnapshot>,
    pub wasm_sha256: String,
}

pub fn path_for(dir: &Path, extension_id: &str) -> PathBuf {
    dir.join(format!("{extension_id}.json"))
}

pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

impl ExtensionSnapshot {
    // The only place that compiles a module purely to read declarations. Every
    // value collected here is a constant of the build -- no source consults its
    // settings while answering -- so the result stays valid until the wasm
    // itself changes, which `wasm_sha256` is what detects.
    pub fn build(wasm_path: &Path) -> HostResult<Self> {
        let bytes = std::fs::read(wasm_path).map_err(|source| HostError::WasmRead {
            path: wasm_path.to_string_lossy().into_owned(),
            source,
        })?;
        let wasm_sha256 = digest(&bytes);

        let manifest = Manifest::new([Wasm::data(bytes)]);
        let (functions, _) =
            crate::transport::functions(crate::transport::denied().context(Vec::new()));
        let mut plugin = Plugin::new(&manifest, functions, true)?;

        let Json(extension): Json<ExtensionInfo> = plugin.call("get_extension", ())?;

        if extension.abi_version < ABI_MIN_SUPPORTED {
            return Err(HostError::AbiTooOld {
                found: extension.abi_version,
                min: ABI_MIN_SUPPORTED,
            });
        }
        if extension.abi_version > ABI_VERSION {
            return Err(HostError::AbiTooNew {
                found: extension.abi_version,
                max: ABI_VERSION,
            });
        }

        let Json(infos): Json<Vec<SourceInfo>> = plugin.call("get_sources", ())?;

        let mut sources = Vec::with_capacity(infos.len());
        for info in infos {
            let sourced = |id: &str| {
                Json(Sourced {
                    source_id: id.to_owned(),
                    payload: (),
                })
            };

            let Json(filters): Json<Vec<Filter>> =
                plugin.call("get_filters", sourced(&info.id))?;
            let Json(settings): Json<Vec<Setting>> =
                plugin.call("get_settings", sourced(&info.id))?;
            let Json(rate_limits): Json<Vec<RateLimit>> =
                plugin.call("get_rate_limits", sourced(&info.id))?;

            sources.push(SourceSnapshot {
                info,
                filters,
                settings,
                rate_limits,
            });
        }

        Ok(Self {
            extension,
            sources,
            wasm_sha256,
        })
    }

    // A snapshot is a cache, so anything unreadable or from another build is
    // simply absent and the caller rebuilds it.
    pub fn load_fresh(path: &Path, wasm_sha256: &str) -> Option<Self> {
        let raw = std::fs::read_to_string(path).ok()?;
        let snapshot: Self = serde_json::from_str(&raw).ok()?;
        (snapshot.wasm_sha256 == wasm_sha256).then_some(snapshot)
    }

    pub fn write(&self, path: &Path) -> HostResult<()> {
        let encoded = serde_json::to_string(self)?;
        std::fs::write(path, encoded).map_err(|source| HostError::SnapshotWrite {
            path: path.to_string_lossy().into_owned(),
            source,
        })
    }

    pub fn source(&self, source_id: &str) -> Option<&SourceSnapshot> {
        self.sources.iter().find(|s| s.info.id == source_id)
    }

    pub fn hosts(&self) -> Vec<String> {
        let mut hosts: Vec<String> = self
            .sources
            .iter()
            .flat_map(|s| s.info.hosts.iter().cloned())
            .collect();
        hosts.sort();
        hosts.dedup();
        hosts
    }
}
