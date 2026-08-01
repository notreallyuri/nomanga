use crate::rate_limit::RateLimiter;
use crate::snapshot::{self, ExtensionSnapshot, SourceSnapshot};
use crate::{CompiledExtension, ExtensionMetadata, HostError, HostResult, LoadedExtension};
use nomanga_core::extension::config::Setting;
use nomanga_core::extension::filter::Filter;
use nomanga_core::extension::info::ExtensionInfo;
use nomanga_core::extension::rate_limit::SourceMethod;
use nomanga_core::extension::source::SourceInfo;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct SourceHandle {
    pub info: SourceInfo,
    pub extension_id: String,
    meta: Arc<ExtensionMetadata>,
    config: Arc<Mutex<HashMap<String, String>>>,
    transport: crate::transport::TransportShared,
    enabled: Arc<AtomicBool>,
    plugin: Arc<Mutex<Option<Loaded>>>,
    limiter: Arc<Mutex<RateLimiter>>,
    limits_fresh: Arc<AtomicBool>,
}

// The instant lives with the compiled artefact rather than beside it so the two
// can never disagree about whether a source is in use.
struct Loaded {
    compiled: CompiledExtension,
    last_used: Instant,
}

impl SourceHandle {
    // Compiling a source's wasm costs several MB of resident memory, so it
    // happens here -- on the first call that actually needs to run guest code --
    // rather than for every installed source at startup. The lock is held across
    // the build so a burst of concurrent first calls compiles once, not once
    // each.
    //
    // What is cached between calls is only the compiled code. The instance `f`
    // runs against is built here and dropped before this returns, which is what
    // hands back the linear memory the call grew: a source that parsed one
    // enormous page does not sit on that peak until the eviction sweep notices
    // it. Instantiating costs single-digit milliseconds against calls that are
    // dominated by the network.
    pub fn with_plugin<T>(
        &self,
        f: impl FnOnce(&mut LoadedExtension) -> HostResult<T>,
    ) -> HostResult<T> {
        // Checked before the lock so a source the user turned off can never
        // reach the build below, which is what bounds how much an install can
        // ever cost: only sources they opted into are compilable.
        if !self.enabled.load(Ordering::Relaxed) {
            return Err(HostError::SourceDisabled(self.info.id.clone()));
        }

        let mut guard = self.plugin.lock().map_err(|_| HostError::Poisoned)?;

        if guard.is_none() {
            *guard = Some(Loaded {
                compiled: self.build()?,
                last_used: Instant::now(),
            });
        }

        let loaded = guard.as_mut().expect("just built");

        let mut instance = loaded.compiled.instantiate()?;

        self.refresh_limits(&mut instance);

        let result = f(&mut instance);

        // Before the timestamp, so the memory is already back by the time this
        // source can be considered idle.
        drop(instance);

        // Stamped on the way out, and for failures too: a call that errored
        // still means the user is on this source, and evicting it would only
        // make the retry slower.
        loaded.last_used = Instant::now();

        result
    }

    // A source may scale its budget by its own settings -- an API key that lifts
    // the ceiling -- and the snapshot is taken with no config at all, so what it
    // recorded is the anonymous floor. This is the first moment a configured
    // instance exists, so the real budget is read here and then left alone until
    // `set_config` says the settings moved.
    //
    // Failure keeps the floor rather than propagating: a source whose
    // `get_rate_limits` errors still works, and throttling it conservatively is
    // the safe outcome. The flag stays down so the next call retries.
    fn refresh_limits(&self, plugin: &mut LoadedExtension) {
        if self.limits_fresh.load(Ordering::Relaxed) {
            return;
        }

        let Ok(limits) = plugin.rate_limits(&self.info.id) else {
            return;
        };

        if let Ok(mut limiter) = self.limiter.lock() {
            limiter.replace(&limits);
            self.limits_fresh.store(true, Ordering::Relaxed);
        }
    }

    // `try_lock` because a source mid-call is in use by definition, and the
    // sweeper must never park behind a network round trip.
    fn evict_if_idle(&self, idle_for: Duration) -> bool {
        let Ok(mut guard) = self.plugin.try_lock() else {
            return false;
        };

        let idle = guard
            .as_ref()
            .is_some_and(|l| l.last_used.elapsed() >= idle_for);

        if idle {
            *guard = None;
        }

        idle
    }

    fn build(&self) -> HostResult<CompiledExtension> {
        let config = {
            let config = self.config.lock().map_err(|_| HostError::Poisoned)?;
            config.clone()
        };
        let hosts = self.info.hosts.clone();

        self.meta
            .compile(hosts.clone(), config, self.transport.context(hosts))
    }

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

    // Settings reach the guest through the manifest, which is fixed once a
    // plugin is built, so the instance is dropped rather than rebuilt here --
    // the next call picks the new values up.
    pub fn set_config(&self, config: HashMap<String, String>) -> HostResult<()> {
        {
            let mut current = self.config.lock().map_err(|_| HostError::Poisoned)?;
            *current = config;
        }

        // The budget may have been keyed to whatever just changed, so it is
        // re-read on the next call rather than carried over.
        self.limits_fresh.store(false, Ordering::Relaxed);

        let mut plugin = self.plugin.lock().map_err(|_| HostError::Poisoned)?;
        *plugin = None;

        Ok(())
    }

    pub fn is_loaded(&self) -> bool {
        self.plugin.lock().is_ok_and(|p| p.is_some())
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    // Turning a source off releases whatever it had already built rather than
    // waiting for the process to end, so the memory comes back at the moment
    // the user asks for it.
    pub fn set_enabled(&self, enabled: bool) -> HostResult<()> {
        self.enabled.store(enabled, Ordering::Relaxed);

        if !enabled {
            let mut plugin = self.plugin.lock().map_err(|_| HostError::Poisoned)?;
            *plugin = None;
        }

        Ok(())
    }
}

pub struct Registry {
    dir: PathBuf,
    snapshots: Vec<ExtensionSnapshot>,
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
            snapshots: Vec::new(),
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

        let snapshot = ExtensionSnapshot::build(src)?;

        let dest = self.dir.join(format!("{}.wasm", snapshot.extension.id));
        std::fs::create_dir_all(&self.dir).ok();
        std::fs::copy(src, &dest).map_err(|source| HostError::WasmRead {
            path: dest.to_string_lossy().into_owned(),
            source,
        })?;

        // Installing is the one time the user is waiting on us and can act on a
        // filesystem problem, so a snapshot that cannot be persisted is an error
        // here rather than a silently slower startup forever after.
        snapshot.write(&snapshot::path_for(&self.dir, &snapshot.extension.id))?;

        let info = snapshot.extension.clone();
        self.adopt(snapshot, &dest, configs);

        Ok(info)
    }

    pub fn set_config(&self, source_id: &str, config: HashMap<String, String>) -> HostResult<()> {
        self.sources
            .get(source_id)
            .ok_or_else(|| HostError::UnknownSource(source_id.to_owned()))?
            .set_config(config)
    }

    fn load_from(
        &mut self,
        path: &Path,
        configs: &HashMap<String, HashMap<String, String>>,
    ) -> HostResult<()> {
        let snapshot = self.snapshot_for(path)?;
        self.adopt(snapshot, path, configs);

        Ok(())
    }

    // Reads the sidecar written at install time, falling back to a rebuild when
    // it is missing or describes a different build of the wasm -- the latter
    // covers an extension updated out of band, whose declarations would
    // otherwise be served stale forever.
    fn snapshot_for(&self, path: &Path) -> HostResult<ExtensionSnapshot> {
        let hash = {
            let bytes = std::fs::read(path).map_err(|source| HostError::WasmRead {
                path: path.to_string_lossy().into_owned(),
                source,
            })?;
            snapshot::digest(&bytes)
        };

        // Keyed on the file name rather than the extension id so a lookup and a
        // write always agree, even for a wasm dropped in under another name.
        let stem = path.file_stem().unwrap_or_default().to_string_lossy();
        let sidecar = snapshot::path_for(&self.dir, &stem);

        if let Some(cached) = ExtensionSnapshot::load_fresh(&sidecar, &hash) {
            return Ok(cached);
        }

        let rebuilt = ExtensionSnapshot::build(path)?;
        if let Err(e) = rebuilt.write(&sidecar) {
            eprintln!("could not cache metadata for {}: {e}", rebuilt.extension.id);
        }

        Ok(rebuilt)
    }

    // Replaces any already-loaded extension of the same id rather than adding to
    // it, so a reinstall does not list the extension twice and a source the new
    // build dropped does not linger. Registering a source only records how to
    // build it; nothing here runs guest code.
    fn adopt(
        &mut self,
        snapshot: ExtensionSnapshot,
        path: &Path,
        configs: &HashMap<String, HashMap<String, String>>,
    ) {
        let extension_id = snapshot.extension.id.clone();
        let meta = Arc::new(ExtensionMetadata::from_snapshot(
            &snapshot,
            path.to_string_lossy(),
        ));

        let handles: Vec<SourceHandle> = snapshot
            .sources
            .iter()
            .map(|source| SourceHandle {
                info: source.info.clone(),
                extension_id: extension_id.clone(),
                meta: meta.clone(),
                config: Arc::new(Mutex::new(
                    configs.get(&source.info.id).cloned().unwrap_or_default(),
                )),
                transport: self.transport.clone(),
                // The host has no idea which sources the user opted into; the
                // application pushes that in right after loading. Starting open
                // rather than closed means forgetting to costs memory, not a
                // registry where nothing works.
                enabled: Arc::new(AtomicBool::new(true)),
                plugin: Arc::new(Mutex::new(None)),
                // Seeded from the snapshot, which is the source's unconfigured
                // answer. `throttled` reserves before the plugin exists, so the
                // very first call is metered by this -- which is why the static
                // declaration has to be the floor, not the optimistic ceiling.
                limiter: Arc::new(Mutex::new(RateLimiter::new(&source.rate_limits))),
                limits_fresh: Arc::new(AtomicBool::new(false)),
            })
            .collect();

        self.sources.retain(|_, h| h.extension_id != extension_id);
        for handle in handles {
            self.sources.insert(handle.info.id.clone(), handle);
        }

        match self
            .snapshots
            .iter_mut()
            .find(|s| s.extension.id == extension_id)
        {
            Some(existing) => *existing = snapshot,
            None => self.snapshots.push(snapshot),
        }
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

    pub fn loaded_count(&self) -> usize {
        self.sources.values().filter(|h| h.is_loaded()).count()
    }

    // Replaces the whole gate rather than merging, so a source that has lost its
    // preference row ends up off instead of keeping a stale opt-in.
    pub fn set_enabled(&self, enabled: &HashSet<String>) -> HostResult<()> {
        for (id, handle) in &self.sources {
            handle.set_enabled(enabled.contains(id))?;
        }

        Ok(())
    }

    pub fn set_source_enabled(&self, source_id: &str, enabled: bool) -> HostResult<()> {
        self.sources
            .get(source_id)
            .ok_or_else(|| HostError::UnknownSource(source_id.to_owned()))?
            .set_enabled(enabled)
    }

    // Compiled code is the bulk of a loaded source and most of it returns to the
    // OS when dropped, so a source nobody has touched in a while is worth giving
    // up: rebuilding it costs milliseconds on the next call.
    pub fn evict_idle(&self, idle_for: Duration) -> usize {
        self.sources
            .values()
            .filter(|h| h.evict_if_idle(idle_for))
            .count()
    }

    pub fn extensions(&self) -> Vec<ExtensionInfo> {
        self.snapshots
            .iter()
            .map(|s| s.extension.clone())
            .collect()
    }

    fn source_snapshot(&self, source_id: &str) -> HostResult<&SourceSnapshot> {
        self.snapshots
            .iter()
            .find_map(|s| s.source(source_id))
            .ok_or_else(|| HostError::UnknownSource(source_id.to_owned()))
    }

    pub fn filters(&self, source_id: &str) -> HostResult<Vec<Filter>> {
        Ok(self.source_snapshot(source_id)?.filters.clone())
    }

    pub fn settings(&self, source_id: &str) -> HostResult<Vec<Setting>> {
        Ok(self.source_snapshot(source_id)?.settings.clone())
    }

    pub fn empty(dir: impl Into<PathBuf>, transport: crate::transport::TransportShared) -> Self {
        Self {
            dir: dir.into(),
            snapshots: Vec::new(),
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

        if removed.is_empty()
            && !self
                .snapshots
                .iter()
                .any(|s| s.extension.id == extension_id)
        {
            return Err(HostError::UnknownSource(extension_id.to_owned()));
        }

        for id in &removed {
            self.sources.remove(id);
        }

        self.snapshots.retain(|s| s.extension.id != extension_id);

        std::fs::remove_file(snapshot::path_for(&self.dir, extension_id)).ok();

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
