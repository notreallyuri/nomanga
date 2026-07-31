use crate::commands::*;
use nomanga_services::{StartupWarning, WarningKind};
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tauri::Manager;

pub mod background;
pub mod commands;
pub mod downloads;
pub mod error;
pub mod image_proxy;
pub mod transport;

pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub http: reqwest::Client,
    pub registry: Arc<RwLock<nomanga_host::registry::Registry>>,
    pub settings: Arc<RwLock<nomanga_services::settings::Settings>>,
    pub settings_path: PathBuf,
    pub startup_warnings: Arc<RwLock<Vec<nomanga_services::StartupWarning>>>,
    pub downloads: downloads::DownloadManager,
    pub downloads_dir: PathBuf,
    pub image_cache_dir: PathBuf,
    pub sync: Arc<RwLock<nomanga_services::sync::SyncState>>,
    pub sync_path: PathBuf,
    pub transport: nomanga_host::transport::TransportShared,
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
            library::cache_entry_chapters,
            library::remove_from_library,
            library::is_in_library,
            library::list_categories,
            library::library_lock_is_set,
            library::verify_library_password,
            library::set_library_password,
            library::clear_library_lock,
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
            source::invalidate_source_filters,
            source::source_homepage,
            source::source_search,
            source::source_section,
            source::source_manga,
            source::source_chapters,
            source::source_pages,
            source::install_extension,
            // cloudflare-style interstitials
            challenge::solve_challenge,
            challenge::cancel_challenge,
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
            // repositories
            commands::repository::list_repositories,
            commands::repository::add_repository,
            commands::repository::remove_repository,
            commands::repository::browse_repositories,
            commands::repository::install_from_repository,
            // downloads
            commands::downloads::queue_downloads,
            commands::downloads::download_queue,
            commands::downloads::set_downloads_paused,
            commands::downloads::downloads_paused,
            commands::downloads::cancel_download,
            commands::downloads::cancel_all_downloads,
            commands::downloads::downloaded_chapter_ids,
            commands::downloads::local_pages,
            commands::downloads::delete_download,
            commands::downloads::list_downloads,
            // backup
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::backup::restart_app,
            // sync
            commands::sync::sync_status,
            commands::sync::set_sync_folder,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::set_sync_hooks,
            // debug
            commands::debug::debug_state,
            commands::debug::debug_table,
            commands::debug::call_log,
            commands::debug::set_call_recording,
            commands::debug::clear_call_log,
            commands::debug::export_call_log,
            commands::debug::export_table_rows,
            // cache
            commands::cache::image_cache_stats,
            commands::cache::clear_image_cache,
            //startup
            startup::take_startup_warnings
        ])
}

/// Strips the quotes `register_all` puts around the binary path in the dev
/// handler's `Exec`. The quoting is legal, but xdg-open's `first_word` does not
/// remove it, so its `command -v` check fails and it falls through to opening a
/// browser instead — and Chrome dispatches unknown schemes through xdg-open, so
/// the link silently does nothing. `gio` and the portal are unaffected, as are
/// packaged builds, which ship their own .desktop with an unquoted Exec.
#[cfg(all(debug_assertions, target_os = "linux"))]
fn unquote_dev_handler_exec() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(stem) = exe.file_stem().and_then(|s| s.to_str()) else {
        return;
    };

    let data_dir = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")));
    let Some(path) = data_dir.map(|d| {
        d.join("applications")
            .join(format!("{stem}-handler.desktop"))
    }) else {
        return;
    };

    let Ok(contents) = std::fs::read_to_string(&path) else {
        return;
    };

    let fixed = contents
        .lines()
        .map(|line| {
            if line.starts_with("Exec=") {
                line.replace('"', "")
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    if fixed != contents.trim_end_matches('\n') {
        std::fs::write(&path, format!("{fixed}\n")).ok();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    // Relative to client/src-tauri, so it fails whenever the binary starts
    // anywhere else — a nomanga:// link starts it from the browser's directory.
    // Not worth aborting for: tests/export_bindings.rs is what regenerates the
    // file, and such a launch exists only to forward its argv to the running
    // instance.
    #[cfg(debug_assertions)]
    if let Err(e) = builder.export(
        specta_typescript::Typescript::default(),
        "../src/types/bindings.ts",
    ) {
        eprintln!("skipped exporting typescript bindings: {e}");
    }

    tauri::Builder::default()
        // Must stay first, and must come before deep-link: on Linux and Windows
        // a nomanga:// link launches a fresh process with the URL in argv, so
        // without this the running app never sees it and a second copy opens on
        // the same database. The plugin's deep-link feature forwards that argv
        // to the running instance as an open-url event.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .register_asynchronous_uri_scheme_protocol(image_proxy::SCHEME, image_proxy::handle)
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // A packaged build gets nomanga:// from its installer or .desktop
            // file; a dev build has neither, so it registers at runtime.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all().ok();
                #[cfg(target_os = "linux")]
                unquote_dev_handler_exec();
            }

            let handle = app.handle().clone();
            let dir = handle.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();

            let db_path = dir.join("library.db");
            let (pool, configs, enabled_sources) = tauri::async_runtime::block_on(async {
                let pool = nomanga_services::db::open(db_path.to_str().expect("non-utf8 db path"))
                    .await
                    .expect("failed to open database");
                let configs = nomanga_services::source::config::all_configs(&pool)
                    .await
                    .unwrap_or_default();
                let enabled_sources = nomanga_services::source::preference::enabled_ids(&pool)
                    .await
                    .unwrap_or_default();
                (pool, configs, enabled_sources)
            });

            let mut warnings = Vec::new();

            // One jar behind the transport, the image proxy and the download
            // worker alike: a source that authenticates its CDN does so from
            // inside a `pages()` call, and the fetch that needs the cookie
            // happens later, in the app.
            let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());

            let http = reqwest::Client::builder()
                .user_agent(nomanga_core::extension::common::USER_AGENT)
                .cookie_provider(jar.clone())
                .build()
                .expect("failed to build http client");

            let transport = transport::shared(http.clone(), jar.clone());

            let registry = match nomanga_host::registry::Registry::scan(
                dir.join("extensions"),
                &configs,
                transport.clone(),
            ) {
                Ok(r) => r,
                Err(e) => {
                    warnings.push(StartupWarning {
                        kind: WarningKind::ExtensionFailed,
                        message: format!("Could not load extensions: {e}"),
                    });
                    nomanga_host::registry::Registry::empty(
                        dir.join("extensions"),
                        transport.clone(),
                    )
                }
            };

            // Until this lands, every source is compilable; a source the user
            // never turned on must never build its plugin.
            if let Err(e) = registry.set_enabled(&enabled_sources) {
                warnings.push(StartupWarning {
                    kind: WarningKind::ExtensionFailed,
                    message: format!("Could not apply source preferences: {e}"),
                });
            }

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
            let downloads =
                downloads::DownloadManager::new(handle.clone(), downloads_dir.clone(), jar.clone());

            let sync_path = dir.join("sync.json");
            let mut sync = nomanga_services::sync::load(&sync_path).unwrap_or_default();

            // Only matters as a destination when the folder itself is the
            // shared medium; with upload/download commands it is staging, so
            // default it rather than making the user choose one.
            if sync.folder.is_none() {
                sync.folder = Some(dir.join("sync"));
            }

            let image_cache_dir = handle
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| dir.clone())
                .join("images");
            std::fs::create_dir_all(&image_cache_dir).ok();

            app.manage(AppState {
                pool,
                http,
                registry: Arc::new(RwLock::new(registry)),
                settings: Arc::new(RwLock::new(settings)),
                settings_path,
                startup_warnings: Arc::new(RwLock::new(warnings)),
                downloads,
                image_cache_dir,
                sync: Arc::new(RwLock::new(sync)),
                sync_path,
                transport,
                downloads_dir,
            });

            tauri::async_runtime::spawn(downloads::restore(handle.clone()));
            tauri::async_runtime::spawn(background::run_loop(handle.clone()));
            tauri::async_runtime::spawn(background::evict_loop(handle.clone()));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
