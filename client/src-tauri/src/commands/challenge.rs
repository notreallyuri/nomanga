use crate::{
    error::{CommandError, CommandResult},
    AppState,
};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "cf-challenge";
const POLL: Duration = Duration::from_millis(400);
const TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ChallengeOutcome {
    pub solved: bool,
    pub seen: Vec<String>,
    pub reads: u32,
    pub error: Option<String>,
    pub landed: String,
}

#[tauri::command]
#[specta::specta]
pub async fn solve_challenge(
    app: AppHandle,
    state: State<'_, AppState>,
    source_id: String,
) -> CommandResult<ChallengeOutcome> {
    let source = {
        let registry = state.registry.read()?;
        registry.sources().into_iter().find(|s| s.id == source_id)
    };

    let source = source.ok_or_else(|| CommandError::Source {
        source_id: Some(source_id.clone()),
        message: "unknown source".to_owned(),
    })?;

    let challenge = source
        .challenge
        .clone()
        .ok_or_else(|| CommandError::Source {
            source_id: Some(source_id.clone()),
            message: "source declares no challenge".to_owned(),
        })?;

    let url: Url = challenge.url.parse().map_err(|e| CommandError::Source {
        source_id: Some(source_id.clone()),
        message: format!("challenge url is not a url: {e}"),
    })?;

    // A previous attempt may have been left open by a reload.
    if let Some(stale) = app.get_webview_window(LABEL) {
        let _ = stale.close();
    }

    // Deliberately *not* pinned to core's USER_AGENT. Forcing a Firefox string
    // onto a WebKit engine makes Cloudflare serve Gecko-targeted challenge
    // code, which hangs and paints the window black; left alone, the engine is
    // consistent with itself and the challenge solves. Measured 2026-07-30.
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url.clone()))
        .title(format!("{} — browser check", source.name))
        .inner_size(520.0, 660.0)
        .center()
        .focused(true)
        .always_on_top(true)
        .build()
        .map_err(|e| CommandError::Internal {
            message: format!("could not open the challenge window: {e}"),
        })?;

    let deadline = std::time::Instant::now() + TIMEOUT;
    let mut solved = false;
    let mut last_error: Option<String> = None;
    let mut reads = 0u32;
    let mut seen: Vec<String> = Vec::new();
    let mut landed_at = url.to_string();

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(POLL).await;

        // Closed by the user, the cancel button, or a reload.
        if app.get_webview_window(LABEL).is_none() {
            break;
        }

        // Read against wherever the page actually ended up. A challenge that
        // redirects to another host sets its clearance there, and asking for
        // the URL we opened would come back empty however well it went.
        let landed = window.url().unwrap_or_else(|_| url.clone());

        // Reading the cookie store dispatches onto the webview thread and is
        // documented to deadlock if it happens on a synchronous command; this
        // one is async and the read is moved off the runtime thread besides.
        let probe = window.clone();
        let for_url = landed.clone();
        let cookies = tokio::task::spawn_blocking(move || probe.cookies_for_url(for_url))
            .await
            .map_err(|e| CommandError::Internal {
                message: format!("cookie read panicked: {e}"),
            })?;

        let cookies = match cookies {
            Ok(cookies) => cookies,
            Err(e) => {
                // A read that fails every poll looks exactly like a challenge
                // nobody completed, so it must not be swallowed.
                last_error = Some(e.to_string());
                continue;
            }
        };

        reads += 1;
        landed_at = landed.to_string();
        seen = cookies.iter().map(|c| c.name().to_owned()).collect();

        let harvested: Vec<_> = cookies
            .iter()
            .filter(|c| challenge.cookies.iter().any(|want| want == c.name()))
            .collect();

        if harvested.len() < challenge.cookies.len() {
            continue;
        }

        // Straight into the jar the transport, image proxy and download worker
        // all share — the same writer guest::set_cookie() reaches.
        //
        // Domain and Path are carried over rather than dropped: a clearance is
        // issued for `.natomanga.com`, and a bare `name=value` would be stored
        // host-only against whichever host happened to be challenged.
        for cookie in harvested {
            let mut set = format!("{}={}", cookie.name(), cookie.value());

            if let Some(domain) = cookie.domain() {
                set.push_str(&format!("; Domain={domain}"));
            }
            if let Some(path) = cookie.path() {
                set.push_str(&format!("; Path={path}"));
            }

            (state.transport.set_cookie)(landed.as_str(), &set);
        }

        solved = true;
        break;
    }

    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }

    Ok(ChallengeOutcome {
        solved,
        seen,
        reads,
        error: last_error,
        landed: landed_at,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_challenge(app: AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.close().map_err(|e| CommandError::Internal {
            message: format!("could not close the challenge window: {e}"),
        })?;
    }

    Ok(())
}
