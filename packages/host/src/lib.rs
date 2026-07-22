use extism::{Manifest, Plugin, Wasm, convert::Json};
use nomanga_core::{
    data::{
        chapter::{Chapter, Page},
        homepage::Homepage,
        manga::Manga,
    },
    extension::{
        config::Setting,
        error::SourceResult,
        filter::Filter,
        info::ExtensionInfo,
        query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef},
        source::{ABI_VERSION, SourceInfo, Sourced},
    },
};
use std::collections::HashMap;

use crate::error::{HostError, HostResult};

pub mod error;

pub struct ExtensionMetadata {
    pub extension: ExtensionInfo,
    pub sources: Vec<SourceInfo>,
    wasm_path: String,
}

impl ExtensionMetadata {
    pub fn inspect(path: impl Into<String>) -> HostResult<Self> {
        let wasm_path = path.into();

        let bytes = std::fs::read(&wasm_path).map_err(|source| HostError::WasmRead {
            path: wasm_path.clone(),
            source,
        })?;

        let manifest = Manifest::new([Wasm::data(bytes)]);
        let mut plugin = Plugin::new(&manifest, [], true)?;

        let Json(extension): Json<ExtensionInfo> = plugin.call("get_extension", ())?;

        if extension.abi_version != ABI_VERSION {
            return Err(HostError::AbiMismatch {
                found: extension.abi_version,
                supported: ABI_VERSION,
            });
        }

        let Json(sources): Json<Vec<SourceInfo>> = plugin.call("get_sources", ())?;

        Ok(Self {
            extension,
            sources,
            wasm_path,
        })
    }
    pub fn all_hosts(&self) -> Vec<String> {
        let mut hosts: Vec<String> = self
            .sources
            .iter()
            .flat_map(|s| s.hosts.iter().cloned())
            .collect();
        hosts.sort();
        hosts.dedup();
        hosts
    }
    pub fn activate(
        &self,
        allowed_hosts: Vec<String>,
        config: HashMap<String, String>,
    ) -> HostResult<LoadedExtension> {
        let bytes = std::fs::read(&self.wasm_path).map_err(|source| HostError::WasmRead {
            path: self.wasm_path.clone(),
            source,
        })?;

        let mut manifest =
            Manifest::new([Wasm::data(bytes)]).with_allowed_hosts(allowed_hosts.into_iter());

        for (k, v) in config {
            manifest = manifest.with_config_key(&k, v);
        }

        let plugin = Plugin::new(&manifest, [], true)?;

        Ok(LoadedExtension {
            plugin,
            source_ids: self.sources.iter().map(|s| s.id.clone()).collect(),
        })
    }
}

pub struct LoadedExtension {
    plugin: Plugin,
    source_ids: Vec<String>,
}

impl LoadedExtension {
    fn ensure_source(&self, source_id: &str) -> HostResult<()> {
        if self.source_ids.iter().any(|id| id == source_id) {
            Ok(())
        } else {
            Err(HostError::UnknownSource(source_id.to_owned()))
        }
    }

    fn call_sourced<P, T>(&mut self, source_id: &str, export: &str, payload: P) -> HostResult<T>
    where
        P: serde::Serialize,
        T: serde::de::DeserializeOwned,
    {
        self.ensure_source(source_id)?;
        let input = Sourced {
            source_id: source_id.to_owned(),
            payload,
        };
        let Json(result): Json<SourceResult<T>> = self.plugin.call(export, Json(input))?;
        Ok(result?)
    }

    pub fn filters(&mut self, source_id: &str) -> HostResult<Vec<Filter>> {
        self.ensure_source(source_id)?;
        let Json(v): Json<Vec<Filter>> = self.plugin.call(
            "get_filters",
            Json(Sourced {
                source_id: source_id.to_owned(),
                payload: (),
            }),
        )?;
        Ok(v)
    }

    pub fn settings(&mut self, source_id: &str) -> HostResult<Vec<Setting>> {
        self.ensure_source(source_id)?;
        let Json(v): Json<Vec<Setting>> = self.plugin.call(
            "get_settings",
            Json(Sourced {
                source_id: source_id.to_owned(),
                payload: (),
            }),
        )?;
        Ok(v)
    }

    pub fn homepage(&mut self, source_id: &str) -> HostResult<Homepage> {
        self.call_sourced(source_id, "get_homepage", ())
    }

    pub fn search(&mut self, source_id: &str, query: SearchQuery) -> HostResult<MangaPage> {
        self.call_sourced(source_id, "search", query)
    }

    pub fn section(&mut self, source_id: &str, section: SectionRef) -> HostResult<MangaPage> {
        self.call_sourced(source_id, "get_section", section)
    }

    pub fn manga(&mut self, source_id: &str, manga: MangaRef) -> HostResult<Manga> {
        self.call_sourced(source_id, "get_manga", manga)
    }

    pub fn chapters(&mut self, source_id: &str, manga: MangaRef) -> HostResult<Vec<Chapter>> {
        self.call_sourced(source_id, "get_chapters", manga)
    }

    pub fn pages(&mut self, source_id: &str, chapter: ChapterRef) -> HostResult<Vec<Page>> {
        self.call_sourced(source_id, "get_pages", chapter)
    }
}
