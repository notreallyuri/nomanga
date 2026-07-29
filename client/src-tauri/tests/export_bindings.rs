use specta_typescript::Typescript;

/// Regenerates `src/types/bindings.ts` without booting the app — `run()` only
/// exports on a debug launch, which needs a display.
#[test]
fn export_bindings() {
    client_lib::specta_builder()
        .export(Typescript::default(), "../src/types/bindings.ts")
        .expect("failed to export typescript bindings");
}
