use crate::AppState;
use crate::commands::library::run_refresh;
use nomanga_services::library::RefreshScope;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const IDLE_POLL: Duration = Duration::from_secs(30 * 60);

// Owned values, so no settings lock guard is held across the loop's awaits.
fn read_config(app: &AppHandle) -> (Option<Duration>, bool) {
    let state = app.state::<AppState>();
    let config = match state.settings.read() {
        Ok(s) => (
            s.system.background_updates.duration(),
            s.system.enable_notifications,
        ),
        Err(_) => (None, false),
    };
    config
}

/// Periodically checks the whole library for new chapters on the interval from
/// system settings, notifying (when enabled) about anything new.
pub async fn run_loop(app: AppHandle) {
    loop {
        let (interval, _) = read_config(&app);

        let Some(interval) = interval else {
            tokio::time::sleep(IDLE_POLL).await;
            continue;
        };

        tokio::time::sleep(interval).await;

        // Re-read: the user may have disabled updates during the wait.
        let (interval_now, notify) = read_config(&app);
        if interval_now.is_none() {
            continue;
        }

        let (pool, registry) = {
            let state = app.state::<AppState>();
            (state.pool.clone(), state.registry.clone())
        };

        // force = false so the per-series throttle still applies.
        let summary = run_refresh(&pool, &registry, &app, RefreshScope::All, false).await;
        if let Ok(summary) = summary {
            if summary.new_chapters > 0 && notify {
                let body = if summary.new_chapters == 1 {
                    "1 new chapter in your library".to_string()
                } else {
                    format!("{} new chapters in your library", summary.new_chapters)
                };
                let _ = app
                    .notification()
                    .builder()
                    .title("nomanga")
                    .body(body)
                    .show();
            }
        }
    }
}
