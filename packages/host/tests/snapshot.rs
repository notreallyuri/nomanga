use nomanga_host::registry::Registry;
use nomanga_host::snapshot::{self, ExtensionSnapshot};
use std::collections::HashMap;

// Skipped unless `TEST_WASM` points at a built extension, for the same reason
// as the reinstall test: no `.wasm` is small enough to vendor here.
fn wasm() -> Option<String> {
    match std::env::var("TEST_WASM") {
        Ok(w) => Some(w),
        Err(_) => {
            eprintln!("skipping: TEST_WASM not set");
            None
        }
    }
}

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nomanga-{tag}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn a_snapshot_round_trips_and_is_rejected_for_another_build() {
    let Some(wasm) = wasm() else { return };
    let dir = temp_dir("snapshot");

    let built = ExtensionSnapshot::build(std::path::Path::new(&wasm)).unwrap();
    assert!(!built.sources.is_empty(), "no sources declared");

    let path = snapshot::path_for(&dir, &built.extension.id);
    built.write(&path).unwrap();

    let loaded = ExtensionSnapshot::load_fresh(&path, &built.wasm_sha256)
        .expect("a snapshot of the same build should load");
    assert_eq!(loaded.extension.id, built.extension.id);
    assert_eq!(loaded.sources.len(), built.sources.len());

    assert!(
        ExtensionSnapshot::load_fresh(&path, "not-the-same-wasm").is_none(),
        "a snapshot of a different build must not be reused"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn installing_writes_a_sidecar_that_answers_metadata_calls() {
    let Some(wasm) = wasm() else { return };
    let dir = temp_dir("sidecar");

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut registry = Registry::empty(&dir, nomanga_host::transport::denied());
    let info = registry.install(&wasm, &configs).unwrap();

    let sidecar = snapshot::path_for(&dir, &info.id);
    assert!(sidecar.exists(), "install left no metadata sidecar");

    let built = ExtensionSnapshot::build(std::path::Path::new(&wasm)).unwrap();
    for source in &built.sources {
        let id = &source.info.id;
        assert_eq!(
            registry.filters(id).unwrap().len(),
            source.filters.len(),
            "filters for {id} did not come back intact"
        );
        assert_eq!(
            registry.settings(id).unwrap().len(),
            source.settings.len(),
            "settings for {id} did not come back intact"
        );
    }

    // A fresh registry over the same directory must be able to answer without
    // the installing process's in-memory state.
    let reopened = Registry::scan(&dir, &configs, nomanga_host::transport::denied()).unwrap();
    assert_eq!(reopened.extensions().len(), 1);
    for source in &built.sources {
        assert!(reopened.filters(&source.info.id).is_ok());
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn uninstalling_removes_the_sidecar() {
    let Some(wasm) = wasm() else { return };
    let dir = temp_dir("sidecar-remove");

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut registry = Registry::empty(&dir, nomanga_host::transport::denied());
    let info = registry.install(&wasm, &configs).unwrap();

    let sidecar = snapshot::path_for(&dir, &info.id);
    assert!(sidecar.exists());

    registry.uninstall(&info.id).unwrap();
    assert!(!sidecar.exists(), "sidecar outlived the extension");

    std::fs::remove_dir_all(&dir).ok();
}
