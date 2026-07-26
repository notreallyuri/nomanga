use crate::commands::*;
use nomanga_services::{StartupWarning, WarningKind};
use specta_typescript::Typescript;
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tauri::Manager;

pub mod background;
pub mod commands;
pub mod downloads;
pub mod error;

pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub registry: Arc<RwLock<nomanga_host::registry::Registry>>,
    pub settings: Arc<RwLock<nomanga_services::settings::Settings>>,
    pub settings_path: PathBuf,
    pub startup_warnings: Arc<RwLock<Vec<nomanga_services::StartupWarning>>>,
    pub downloads: downloads::DownloadManager,
    pub downloads_dir: PathBuf,
}

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(tauri_specta::collect_events![
            commands::LibraryRefreshProgress,
            downloads::DownloadProgress
        ])
        .commands(tauri_specta::collect_commands![
            // library
            library::list_library,
            library::add_to_library,
            library::add_listing_to_library,
            library::add_manga_to_library,
            library::remove_from_library,
            library::is_in_library,
            library::list_categories,
            library::create_category,
            library::rename_category,
            library::update_category_options,
            library::delete_category,
            library::reorder_categories,
            library::categories_for_entry,
            library::set_entry_categories,
            library::bulk_category_counts,
            library::bulk_update_categories,
            library::refresh_library,
            library::library_updates,
            library::clear_library_updates,
            // history
            history::continue_reading,
            history::remove_history_entries,
            history::mark_chapter_read,
            history::mark_chapter_unread,
            history::mark_chapters_read,
            history::mark_chapters_unread,
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
            settings::effective_reader_settings,
            settings::get_source_reader_override,
            settings::set_source_reader_override,
            settings::get_manga_reader_override,
            settings::set_manga_reader_override,
            // extension
            extension::list_extensions,
            extension::uninstall_extension,
            extension::list_sources_with_preferences,
            extension::set_source_preference,
            extension::get_source_settings,
            extension::save_source_settings,
            // downloads
            commands::downloads::queue_downloads,
            commands::downloads::downloaded_chapter_ids,
            commands::downloads::local_pages,
            commands::downloads::delete_download,
            commands::downloads::list_downloads,
            //startup
            startup::take_startup_warnings
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(Typescript::default(), "../src/types/bindings.ts")
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            let handle = app.handle().clone();
            let dir = handle.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();

            let db_path = dir.join("library.db");
            let (pool, configs) = tauri::async_runtime::block_on(async {
                let pool = nomanga_services::db::open(db_path.to_str().expect("non-utf8 db path"))
                    .await
                    .expect("failed to open database");
                let configs = nomanga_services::source::config::all_configs(&pool)
                    .await
                    .unwrap_or_default();
                (pool, configs)
            });

            let mut warnings = Vec::new();

            let registry =
                match nomanga_host::registry::Registry::scan(dir.join("extensions"), &configs) {
                    Ok(r) => r,
                    Err(e) => {
                        warnings.push(StartupWarning {
                            kind: WarningKind::ExtensionFailed,
                            message: format!("Could not load extensions: {e}"),
                        });
                        nomanga_host::registry::Registry::empty(dir.join("extensions"))
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

            let downloads_dir = dir.join("downloads");
            std::fs::create_dir_all(&downloads_dir).ok();
            let downloads = downloads::DownloadManager::new(handle.clone(), downloads_dir.clone());

            app.manage(AppState {
                pool,
                registry: Arc::new(RwLock::new(registry)),
                settings: Arc::new(RwLock::new(settings)),
                settings_path,
                startup_warnings: Arc::new(RwLock::new(warnings)),
                downloads,
                downloads_dir,
            });

            tauri::async_runtime::spawn(background::run_loop(handle.clone()));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
