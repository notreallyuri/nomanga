use nomanga_host::registry::Registry;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

// Skipped unless `TEST_WASM` points at a built extension, as in the other host
// tests -- no `.wasm` is small enough to vendor here.
fn wasm() -> Option<String> {
    match std::env::var("TEST_WASM") {
        Ok(w) => Some(w),
        Err(_) => {
            eprintln!("skipping: TEST_WASM not set");
            None
        }
    }
}

fn installed(tag: &str, wasm: &str) -> (std::path::PathBuf, Registry) {
    let dir = std::env::temp_dir().join(format!("nomanga-{tag}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut registry = Registry::empty(&dir, nomanga_host::transport::denied());
    registry.install(wasm, &configs).unwrap();

    (dir, registry)
}

#[test]
fn scanning_registers_sources_without_instantiating_them() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-scan", &wasm);
    drop(registry);

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let registry = Registry::scan(&dir, &configs, nomanga_host::transport::denied()).unwrap();

    assert!(!registry.sources().is_empty(), "no sources registered");
    assert_eq!(
        registry.loaded_count(),
        0,
        "scan compiled a plugin it did not need"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn metadata_is_answered_without_instantiating() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-metadata", &wasm);

    for info in registry.sources() {
        registry.filters(&info.id).unwrap();
        registry.settings(&info.id).unwrap();
    }
    registry.extensions();

    assert_eq!(
        registry.loaded_count(),
        0,
        "reading declarations compiled a plugin"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_call_instantiates_only_the_source_it_targets() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-call", &wasm);

    let sources = registry.sources();
    let target = &sources[0];

    let handle = registry.source(&target.id).unwrap();
    handle.with_plugin(|_| Ok(())).unwrap();

    assert_eq!(
        registry.loaded_count(),
        1,
        "a call to one source should not build the others"
    );
    assert!(registry.source(&target.id).unwrap().is_loaded());

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_disabled_source_is_never_compiled() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-gate", &wasm);

    // Nothing opted in, which is what a fresh install looks like now.
    registry.set_enabled(&HashSet::new()).unwrap();

    let id = registry.sources()[0].id.clone();
    let err = registry
        .source(&id)
        .unwrap()
        .with_plugin(|_| Ok(()))
        .unwrap_err();

    assert!(
        matches!(err, nomanga_host::error::HostError::SourceDisabled(ref s) if *s == id),
        "expected a disabled error, got {err}"
    );
    assert_eq!(
        registry.loaded_count(),
        0,
        "a disabled source must not build a plugin"
    );

    registry.set_source_enabled(&id, true).unwrap();
    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(registry.loaded_count(), 1);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn turning_a_source_off_releases_what_it_had_built() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-gate-off", &wasm);

    let id = registry.sources()[0].id.clone();
    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(registry.loaded_count(), 1);

    registry.set_source_enabled(&id, false).unwrap();

    assert_eq!(
        registry.loaded_count(),
        0,
        "turning a source off should release its instance immediately"
    );
    assert!(!registry.source(&id).unwrap().is_enabled());

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn an_idle_source_is_evicted_and_rebuilt_on_the_next_call() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-evict", &wasm);

    let id = registry.sources()[0].id.clone();
    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(registry.loaded_count(), 1);

    // Nothing has been idle for an hour, so nothing should go.
    assert_eq!(registry.evict_idle(Duration::from_secs(3600)), 0);
    assert_eq!(registry.loaded_count(), 1);

    assert_eq!(registry.evict_idle(Duration::ZERO), 1);
    assert_eq!(registry.loaded_count(), 0);

    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(
        registry.loaded_count(),
        1,
        "an evicted source should rebuild on demand"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_source_being_used_is_not_evicted_from_under_the_call() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-evict-busy", &wasm);

    let id = registry.sources()[0].id.clone();
    let handle = registry.source(&id).unwrap();
    handle.with_plugin(|_| Ok(())).unwrap();

    // Sweep from another thread while this source is mid-call.
    let evicted = handle
        .with_plugin(|_| {
            let registry = &registry;
            Ok(std::thread::scope(|s| {
                s.spawn(|| registry.evict_idle(Duration::ZERO)).join().unwrap()
            }))
        })
        .unwrap();

    assert_eq!(evicted, 0, "the sweeper took a source out mid-call");
    assert_eq!(registry.loaded_count(), 1);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn changing_settings_drops_the_instance_instead_of_rebuilding_it() {
    let Some(wasm) = wasm() else { return };
    let (dir, registry) = installed("lazy-config", &wasm);

    let id = registry.sources()[0].id.clone();
    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(registry.loaded_count(), 1);

    registry
        .set_config(&id, HashMap::from([("language".into(), "korean".into())]))
        .unwrap();

    assert_eq!(
        registry.loaded_count(),
        0,
        "saving settings should release the instance, not replace it"
    );

    // And the source still works afterwards, rebuilt with the new config.
    registry.source(&id).unwrap().with_plugin(|_| Ok(())).unwrap();
    assert_eq!(registry.loaded_count(), 1);

    std::fs::remove_dir_all(&dir).ok();
}
