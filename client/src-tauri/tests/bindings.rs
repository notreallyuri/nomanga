use specta_typescript::Typescript;

#[test]
fn export_bindings() {
    nomanga_client_lib::specta_builder()
        .export(Typescript::default(), "../src/types/bindings.ts")
        .expect("failed to export typescript bindings");
}
