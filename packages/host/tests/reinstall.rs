use nomanga_host::registry::Registry;
use std::collections::HashMap;

/// Skipped unless `TEST_WASM` points at a built extension. No `.wasm` lives in
/// this repo since the packs moved to their own repositories, and the smallest
/// real one is ~1 MB — too large to vendor just for this.
#[test]
fn reinstalling_the_same_extension_does_not_duplicate_it() {
    let Ok(wasm) = std::env::var("TEST_WASM") else {
        eprintln!("skipping: TEST_WASM not set");
        return;
    };
    let dir = std::env::temp_dir().join(format!("nomanga-reinstall-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut registry = Registry::empty(&dir, nomanga_host::transport::denied());

    let first = registry.install(&wasm, &configs).unwrap();
    let sources_after_first = registry.sources().len();

    let second = registry.install(&wasm, &configs).unwrap();

    assert_eq!(first.id, second.id);
    assert_eq!(registry.extensions().len(), 1, "extension listed twice");
    assert_eq!(registry.sources().len(), sources_after_first);

    std::fs::remove_dir_all(&dir).ok();
}
