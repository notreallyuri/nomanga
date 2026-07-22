use crate::{ExtensionMetadata, HostError, HostResult, LoadedExtension};
use nomanga_core::extension::info::ExtensionInfo;
use nomanga_core::extension::source::SourceInfo;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct SourceHandle {
    pub info: SourceInfo,
    pub extension_id: String,
    plugin: Arc<Mutex<LoadedExtension>>,
}

impl SourceHandle {
    pub fn with_plugin<T>(
        &self,
        f: impl FnOnce(&mut LoadedExtension) -> HostResult<T>,
    ) -> HostResult<T> {
        let mut guard = self
            .plugin
            .lock()
            .map_err(|_| HostError::UnknownSource("plugin mutex poisoned".into()))?;
        f(&mut guard)
    }
}

pub struct Registry {
    dir: PathBuf,
    extensions: Vec<ExtensionInfo>,
    sources: HashMap<String, SourceHandle>,
}

impl Registry {
    pub fn scan(dir: impl AsRef<Path>) -> HostResult<Self> {
        let dir = dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&dir).ok();

        let mut registry = Self {
            dir,
            extensions: Vec::new(),
            sources: HashMap::new(),
        };

        let entries = match std::fs::read_dir(&registry.dir) {
            Ok(e) => e,
            Err(_) => return Ok(registry),
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wasm") {
                continue;
            }
            if let Err(e) = registry.load_from(&path) {
                eprintln!("skipping extension {}: {e}", path.display());
            }
        }

        Ok(registry)
    }

    pub fn install(&mut self, wasm_path: impl AsRef<Path>) -> HostResult<ExtensionInfo> {
        let src = wasm_path.as_ref();

        let meta = ExtensionMetadata::inspect(src.to_string_lossy().as_ref())?;

        let dest = self.dir.join(format!("{}.wasm", meta.extension.id));
        std::fs::create_dir_all(&self.dir).ok();
        std::fs::copy(src, &dest).map_err(|source| HostError::WasmRead {
            path: dest.to_string_lossy().into_owned(),
            source,
        })?;

        self.load_from(&dest)?;
        Ok(meta.extension)
    }

    fn load_from(&mut self, path: &Path) -> HostResult<()> {
        let meta = ExtensionMetadata::inspect(path.to_string_lossy().as_ref())?;
        let extension_id = meta.extension.id.clone();

        for source in &meta.sources {
            let plugin = meta.activate(source.hosts.clone(), HashMap::new())?;

            self.sources.insert(
                source.id.clone(),
                SourceHandle {
                    info: source.clone(),
                    extension_id: extension_id.clone(),
                    plugin: Arc::new(Mutex::new(plugin)),
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
}
