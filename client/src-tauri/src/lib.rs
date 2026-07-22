use crate::commands::*;
use nomanga_services::StartupWarning;
use specta_typescript::Typescript;
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tauri::Manager;

pub mod commands;

pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub registry: Arc<RwLock<nomanga_host::registry::Registry>>,
    pub settings: Arc<RwLock<nomanga_services::settings::Settings>>,
    pub settings_path: PathBuf,
    pub startup_warnings: Arc<RwLock<Vec<nomanga_services::StartupWarning>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder =
        tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
            // library
            library::list_library,
            library::add_to_library,
            library::remove_from_library,
            library::is_in_library,
            library::list_categories,
            // history
            history::continue_reading,
            history::mark_chapter_read,
            history::mark_chapter_unread,
            history::mark_chapters_read,
            history::is_chapter_read,
            history::read_chapters_for_manga,
            history::read_count,
            history::update_progress,
            history::get_progress,
            history::finish_chapter,
            // sources
            source::list_sources,
            source::source_filters,
            source::source_homepage,
            source::source_search,
            source::source_section,
            source::source_manga,
            source::source_chapters,
            source::source_pages,
            source::install_extension,
            // settings
            settings::get_settings,
            settings::save_settings,
            //startup
            startup::take_startup_warnings
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(Typescript::default(), "../src/types/bindings.ts")
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            let handle = app.handle().clone();
            let dir = handle.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();

            let db_path = dir.join("library.db");
            let pool = tauri::async_runtime::block_on(async {
                nomanga_services::db::open(db_path.to_str().expect("non-utf8 db path"))
                    .await
                    .expect("failed to open database")
            });

            let mut warnings = Vec::new();

            let registry = match nomanga_host::registry::Registry::scan(dir.join("extensions")) {
                Ok(r) => r,
                Err(e) => {
                    warnings.push(StartupWarning {
                        kind: nomanga_services::WarningKind::ExtensionFailed,
                        message: format!("Could not load extensions: {e}"),
                    });
                    nomanga_host::registry::Registry::scan(
                        std::env::temp_dir().join("nomanga-empty"),
                    )
                    .unwrap_or_else(|_| panic!("cannot create empty registry"))
                }
            };

            let settings_path = dir.join("settings.json");

            let settings = match nomanga_services::settings::load(&settings_path) {
                Ok(s) => s,
                Err(e) => {
                    warnings.push(StartupWarning {
                        kind: nomanga_services::WarningKind::SettingsCorrupt,
                        message: format!(
                            "Settings file could not be read ({e}); using defaults. \
                              Your old file was kept at settings.json.bak."
                        ),
                    });
                    let _ =
                        std::fs::rename(&settings_path, settings_path.with_extension("json.bak"));
                    nomanga_services::settings::Settings::default()
                }
            };

            app.manage(AppState {
                pool,
                registry: Arc::new(RwLock::new(registry)),
                settings: Arc::new(RwLock::new(settings)),
                settings_path,
                startup_warnings: Arc::new(RwLock::new(warnings)),
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
