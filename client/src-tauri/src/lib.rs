use tauri::Manager;

pub mod commands;
use crate::commands::*;
use specta_typescript::Typescript;

pub struct AppState {
    pub pool: sqlx::SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder =
        tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
            library::list_library,
            library::add_to_library,
            library::remove_from_library,
            library::is_in_library,
            library::list_categories,
            history::continue_reading,
            history::mark_chapter_read,
            history::mark_chapter_unread,
            history::mark_chapters_read,
            history::is_chapter_read,
            history::read_chapters_for_manga,
            history::read_count,
            history::update_progress,
            history::get_progress,
            history::finish_chapter
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

            let pool = tauri::async_runtime::block_on(async move {
                let dir = handle.path().app_data_dir().expect("no app data dir");
                std::fs::create_dir_all(&dir).ok();
                let db_path = dir.join("library.db");
                nomanga_services::db::open(db_path.to_str().expect("non-utf8 db path"))
                    .await
                    .expect("failed to open database")
            });

            app.manage(AppState { pool });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
