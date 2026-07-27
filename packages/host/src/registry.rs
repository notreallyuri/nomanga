use crate::rate_limit::RateLimiter;
use crate::{ExtensionMetadata, HostError, HostResult, LoadedExtension};
use nomanga_core::extension::info::ExtensionInfo;
use nomanga_core::extension::rate_limit::SourceMethod;
use nomanga_core::extension::source::SourceInfo;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct SourceHandle {
    pub info: SourceInfo,
    pub extension_id: String,
    wasm_path: PathBuf,
    plugin: Arc<Mutex<LoadedExtension>>,
    limiter: Arc<Mutex<RateLimiter>>,
}

impl SourceHandle {
    pub fn with_plugin<T>(
        &self,
        f: impl FnOnce(&mut LoadedExtension) -> HostResult<T>,
    ) -> HostResult<T> {
        let mut guard = self.plugin.lock().map_err(|_| HostError::Poisoned)?;
        f(&mut guard)
    }

    /// Like [`with_plugin`](Self::with_plugin) but first waits out any rate
    /// limit the source declared for `method`. Safe to call from a blocking
    /// task — it may sleep the current thread.
    pub fn throttled<T>(
        &self,
        method: SourceMethod,
        f: impl FnOnce(&mut LoadedExtension) -> HostResult<T>,
    ) -> HostResult<T> {
        let wait = {
            let mut limiter = self.limiter.lock().map_err(|_| HostError::Poisoned)?;
            limiter.reserve(method)
        };
        if !wait.is_zero() {
            std::thread::sleep(wait);
        }
        self.with_plugin(f)
    }
}

pub struct Registry {
    dir: PathBuf,
    extensions: Vec<ExtensionInfo>,
    sources: HashMap<String, SourceHandle>,
    transport: crate::transport::TransportShared,
}

impl Registry {
    pub fn scan(
        dir: impl AsRef<Path>,
        configs: &HashMap<String, HashMap<String, String>>,
        transport: crate::transport::TransportShared,
    ) -> HostResult<Self> {
        let dir = dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&dir).ok();

        let mut registry = Self {
            dir,
            extensions: Vec::new(),
            sources: HashMap::new(),
            transport,
        };

        let Ok(entries) = std::fs::read_dir(&registry.dir) else {
            return Ok(registry);
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wasm") {
                continue;
            }
            if let Err(e) = registry.load_from(&path, configs) {
                eprintln!("skipping extension {}: {e}", path.display());
            }
        }

        Ok(registry)
    }

    pub fn install(
        &mut self,
        wasm_path: impl AsRef<Path>,
        configs: &HashMap<String, HashMap<String, String>>,
    ) -> HostResult<ExtensionInfo> {
        let src = wasm_path.as_ref();

        let meta = ExtensionMetadata::inspect(src.to_string_lossy().as_ref())?;

        let dest = self.dir.join(format!("{}.wasm", meta.extension.id));
        std::fs::create_dir_all(&self.dir).ok();
        std::fs::copy(src, &dest).map_err(|source| HostError::WasmRead {
            path: dest.to_string_lossy().into_owned(),
            source,
        })?;

        self.load_from(&dest, configs)?;
        Ok(meta.extension)
    }

    pub fn reactivate(
        &mut self,
        source_id: &str,
        config: HashMap<String, String>,
    ) -> HostResult<()> {
        let wasm_path = self
            .sources
            .get(source_id)
            .map(|h| h.wasm_path.clone())
            .ok_or_else(|| HostError::UnknownSource(source_id.to_owned()))?;

        let meta = ExtensionMetadata::inspect(wasm_path.to_string_lossy().as_ref())?;
        let source = meta
            .sources
            .iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| HostError::UnknownSource(source_id.into()))?;

        let mut plugin = meta.activate(
            source.hosts.clone(),
            config,
            self.transport.context(source.hosts.clone()),
        )?;
        let limits = plugin.rate_limits(source_id).unwrap_or_default();

        if let Some(h) = self.sources.get_mut(source_id) {
            h.plugin = Arc::new(Mutex::new(plugin));
            h.limiter = Arc::new(Mutex::new(RateLimiter::new(&limits)));
        }

        Ok(())
    }

    fn load_from(
        &mut self,
        path: &Path,
        configs: &HashMap<String, HashMap<String, String>>,
    ) -> HostResult<()> {
        let meta = ExtensionMetadata::inspect(path.to_string_lossy().as_ref())?;
        let extension_id = meta.extension.id.clone();

        for source in &meta.sources {
            let config = configs.get(&source.id).cloned().unwrap_or_default();
            let mut plugin = meta.activate(
            source.hosts.clone(),
            config,
            self.transport.context(source.hosts.clone()),
        )?;
            let limits = plugin.rate_limits(&source.id).unwrap_or_default();

            self.sources.insert(
                source.id.clone(),
                SourceHandle {
                    info: source.clone(),
                    extension_id: extension_id.clone(),
                    plugin: Arc::new(Mutex::new(plugin)),
                    limiter: Arc::new(Mutex::new(RateLimiter::new(&limits))),
                    wasm_path: path.to_path_buf(),
                },
            );
        }

        self.extensions.push(meta.extension);
        Ok(())
    }

    pub fn source(&self, source_id: &str) -> HostResult<SourceHandle> {
        self.sources
            .get(source_id)
            .cloned()
            .ok_or_else(|| HostError::UnknownSource(source_id.to_owned()))
    }

    pub fn sources(&self) -> Vec<SourceInfo> {
        self.sources.values().map(|h| h.info.clone()).collect()
    }

    pub fn extensions(&self) -> &[ExtensionInfo] {
        &self.extensions
    }

    pub fn empty(dir: impl Into<PathBuf>, transport: crate::transport::TransportShared) -> Self {
        Self {
            dir: dir.into(),
            extensions: Vec::new(),
            sources: HashMap::new(),
            transport,
        }
    }

    pub fn call_log(&self) -> &std::sync::Arc<crate::transport::CallLog> {
        &self.transport.log
    }

    pub fn recording(&self) -> &std::sync::Arc<std::sync::atomic::AtomicBool> {
        &self.transport.recording
    }

    pub fn sources_of(&self, extension_id: &str) -> Vec<SourceInfo> {
        self.sources
            .values()
            .filter(|h| h.extension_id == extension_id)
            .map(|h| h.info.clone())
            .collect()
    }

    pub fn uninstall(&mut self, extension_id: &str) -> HostResult<Vec<String>> {
        let removed: Vec<String> = self
            .sources
            .iter()
            .filter(|(_, h)| h.extension_id == extension_id)
            .map(|(id, _)| id.clone())
            .collect();

        if removed.is_empty() && !self.extensions.iter().any(|e| e.id == extension_id) {
            return Err(HostError::UnknownSource(extension_id.to_owned()));
        }

        for id in &removed {
            self.sources.remove(id);
        }
        self.extensions.retain(|e| e.id != extension_id);

        let path = self.dir.join(format!("{extension_id}.wasm"));
        if path.exists() {
            std::fs::remove_file(&path).map_err(|source| HostError::WasmRead {
                path: path.to_string_lossy().into_owned(),
                source,
            })?;
        }

        Ok(removed)
    }
}
