use crate::error::{HostError, HostResult};
use crate::snapshot::ExtensionSnapshot;
use extism::{CompiledPlugin, Manifest, Plugin, PluginBuilder, Wasm, convert::Json};
use nomanga_core::{
    data::{
        chapter::{Chapter, Page},
        homepage::Homepage,
        manga::Manga,
    },
    extension::{
        error::SourceResult,
        filter::Filter,
        info::ExtensionInfo,
        query::{ChapterRef, MangaPage, MangaRef, SearchQuery, SectionRef},
        rate_limit::RateLimit,
        source::{SourceInfo, Sourced},
    },
};
use std::collections::HashMap;

pub mod error;
pub mod rate_limit;
pub mod snapshot;
pub mod transport;
pub mod registry;

pub struct ExtensionMetadata {
    pub extension: ExtensionInfo,
    pub sources: Vec<SourceInfo>,
    wasm_path: String,
}

impl ExtensionMetadata {
    pub fn inspect(path: impl Into<String>) -> HostResult<Self> {
        let wasm_path = path.into();
        let snapshot = ExtensionSnapshot::build(std::path::Path::new(&wasm_path))?;

        Ok(Self::from_snapshot(&snapshot, wasm_path))
    }

    pub fn from_snapshot(snapshot: &ExtensionSnapshot, wasm_path: impl Into<String>) -> Self {
        Self {
            extension: snapshot.extension.clone(),
            sources: snapshot.sources.iter().map(|s| s.info.clone()).collect(),
            wasm_path: wasm_path.into(),
        }
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
    // Compiling and instantiating are separated because they cost very
    // different things. Compiling is the expensive half -- cranelift turning the
    // module into machine code -- and what it produces is read-only and good
    // until the wasm or the config changes. Instantiating is the half that
    // allocates the linear memory a call actually grows, and it is cheap enough
    // (single-digit milliseconds against a network round trip) to redo per call.
    // Keeping only the compiled half between calls is what stops a source that
    // once parsed a huge chapter list from holding that high-water mark for as
    // long as it stays loaded.
    pub fn compile(
        &self,
        allowed_hosts: Vec<String>,
        config: HashMap<String, String>,
        transport: crate::transport::TransportContext,
    ) -> HostResult<CompiledExtension> {
        let bytes = std::fs::read(&self.wasm_path).map_err(|source| HostError::WasmRead {
            path: self.wasm_path.clone(),
            source,
        })?;

        let mut manifest =
            Manifest::new([Wasm::data(bytes)]).with_allowed_hosts(allowed_hosts.into_iter());

        // Config reaches the guest through the manifest, which is baked into the
        // compiled artefact -- so a settings change has to recompile, and
        // `set_config` drops this rather than trying to patch it.
        for (k, v) in config {
            manifest = manifest.with_config_key(&k, v);
        }

        let (functions, transport_data) = crate::transport::functions(transport);
        let compiled = PluginBuilder::new(manifest)
            .with_functions(functions)
            .with_wasi(true)
            .compile()?;

        Ok(CompiledExtension {
            compiled,
            transport_data,
            source_ids: self.sources.iter().map(|s| s.id.clone()).collect(),
        })
    }

    /// Compiles and instantiates in one step.
    ///
    /// For callers that run a handful of calls and exit -- the CLI, tests --
    /// where there is no second call to amortise a cached compilation over. The
    /// app splits the two instead.
    pub fn activate(
        &self,
        allowed_hosts: Vec<String>,
        config: HashMap<String, String>,
        transport: crate::transport::TransportContext,
    ) -> HostResult<LoadedExtension> {
        self.compile(allowed_hosts, config, transport)?.instantiate()
    }
}

/// An extension compiled but not instantiated: machine code and nothing else.
///
/// The host functions -- and the transport context behind them -- are fixed at
/// compile time, so every instance built from one of these shares them. That is
/// safe here because a source's calls are serialised behind its own lock, and it
/// is why this is cached per source rather than per extension.
pub struct CompiledExtension {
    compiled: CompiledPlugin,
    transport_data: extism::UserData<crate::transport::TransportContext>,
    source_ids: Vec<String>,
}

impl CompiledExtension {
    /// Builds a throwaway instance to run one call on.
    ///
    /// Everything it allocates -- above all the linear memory the guest grows
    /// while parsing -- goes back when the returned value is dropped.
    pub fn instantiate(&self) -> HostResult<LoadedExtension> {
        Ok(LoadedExtension {
            plugin: Plugin::new_from_compiled(&self.compiled)?,
            transport_data: self.transport_data.clone(),
            source_ids: self.source_ids.clone(),
        })
    }
}

pub struct LoadedExtension {
    plugin: Plugin,
    transport_data: extism::UserData<crate::transport::TransportContext>,
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
        crate::transport::set_source(&self.transport_data, source_id);
        let input = Sourced {
            source_id: source_id.to_owned(),
            payload,
        };
        let Json(result): Json<SourceResult<T>> = self.plugin.call(export, Json(input))?;
        Ok(result?)
    }

    // Not served from the snapshot like the other declarations: a source may
    // build its options from the network (nhentai's tag list), and the snapshot
    // is taken with the transport denied, so anything fetched there comes back
    // empty and stays that way until the wasm changes. `get_filters` answers
    // outside `SourceResult`, hence the hand-rolled call.
    pub fn filters(&mut self, source_id: &str) -> HostResult<Vec<Filter>> {
        self.ensure_source(source_id)?;
        crate::transport::set_source(&self.transport_data, source_id);

        let Json(filters): Json<Vec<Filter>> = self.plugin.call(
            "get_filters",
            Json(Sourced {
                source_id: source_id.to_owned(),
                payload: (),
            }),
        )?;

        Ok(filters)
    }

    // Like `filters`, read live rather than off the snapshot: the snapshot plugin
    // is built with no config, so a source that scales its budget by a setting --
    // an API key that doubles the ceiling -- always declares the anonymous
    // numbers there. Answers outside `SourceResult`.
    pub fn rate_limits(&mut self, source_id: &str) -> HostResult<Vec<RateLimit>> {
        self.ensure_source(source_id)?;

        let Json(limits): Json<Vec<RateLimit>> = self.plugin.call(
            "get_rate_limits",
            Json(Sourced {
                source_id: source_id.to_owned(),
                payload: (),
            }),
        )?;

        Ok(limits)
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
