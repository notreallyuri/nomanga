use crate::commands::library::run_refresh;
use crate::AppState;
use nomanga_services::library::RefreshScope;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const IDLE_POLL: Duration = Duration::from_secs(30 * 60);

const EVICT_SWEEP: Duration = Duration::from_secs(60);
const EVICT_AFTER: Duration = Duration::from_secs(5 * 60);

// A loaded source holds several MB of compiled code that comes back when it is
// dropped, and rebuilding costs on the order of 10ms -- cheap enough that the
// user never sees it, so browsing one source does not keep every source they
// visited earlier resident for the rest of the session. Kept separate from the
// library refresh loop, whose interval is user-configurable and far too coarse
// to sweep on.
pub async fn evict_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(EVICT_SWEEP).await;

        let registry = {
            let state = app.state::<AppState>();
            state.registry.clone()
        };

        let Ok(registry) = registry.read() else {
            continue;
        };
        registry.evict_idle(EVICT_AFTER);
    }
}

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

        let (pool, registry, cancel) = {
            let state = app.state::<AppState>();
            (
                state.pool.clone(),
                state.registry.clone(),
                state.refresh_cancel.clone(),
            )
        };

        // force = false so the per-series throttle still applies. The cancel
        // flag is shared with the manual run on purpose: to the user there is
        // one "checking for updates" in progress, and Stop should end whichever
        // one is behind it.
        let summary = run_refresh(&pool, &registry, &app, RefreshScope::All, false, &cancel).await;
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
