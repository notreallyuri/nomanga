use crate::{
    error::{CommandError, CommandResult},
    AppState,
};
use nomanga_core::extension::common::USER_AGENT;
use std::time::Duration;
use tauri::{
    webview::WebviewBuilder, AppHandle, LogicalPosition, LogicalSize, Manager, State, Url,
    WebviewUrl,
};

const LABEL: &str = "cf-challenge";
const POLL: Duration = Duration::from_millis(400);
const TIMEOUT: Duration = Duration::from_secs(180);

/// Where the frontend's dialog body sits, in logical pixels relative to the
/// window. The embedded webview is a native child rather than part of the DOM,
/// so it cannot be laid out by CSS and has to be told.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct ChallengeRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Opens the source's challenge page in an embedded browser view and waits for
/// the user to clear it.
///
/// Returns true once every cookie the source named has appeared and been copied
/// into the shared jar, false on timeout or if the user closed the dialog first.
#[tauri::command]
#[specta::specta]
pub async fn solve_challenge(
    app: AppHandle,
    state: State<'_, AppState>,
    source_id: String,
    rect: ChallengeRect,
) -> CommandResult<bool> {
    let challenge = {
        let registry = state.registry.read()?;
        registry
            .sources()
            .into_iter()
            .find(|s| s.id == source_id)
            .and_then(|s| s.challenge)
    };

    let challenge = challenge.ok_or_else(|| CommandError::Source {
        source_id: Some(source_id.clone()),
        message: "source declares no challenge".to_owned(),
    })?;

    let url: Url = challenge.url.parse().map_err(|e| CommandError::Source {
        source_id: Some(source_id.clone()),
        message: format!("challenge url is not a url: {e}"),
    })?;

    let window = app
        .get_window("main")
        .ok_or_else(|| CommandError::Internal {
            message: "no main window".to_owned(),
        })?;

    // A previous attempt may have been left open by a reload.
    if let Some(stale) = app.get_webview(LABEL) {
        let _ = stale.close();
    }

    // The user agent has to match the client that will later present the
    // cookie: Cloudflare binds a clearance to the UA that earned it, and a
    // mismatch reads as a forged cookie. This is the MadaraDex trap.
    let builder =
        WebviewBuilder::new(LABEL, WebviewUrl::External(url.clone())).user_agent(USER_AGENT);

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(rect.x, rect.y),
            LogicalSize::new(rect.width, rect.height),
        )
        .map_err(|e| CommandError::Internal {
            message: format!("could not open the challenge view: {e}"),
        })?;

    let deadline = std::time::Instant::now() + TIMEOUT;
    let mut solved = false;

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(POLL).await;

        // Closed from the frontend's cancel button, or by a reload.
        if app.get_webview(LABEL).is_none() {
            return Ok(false);
        }

        // Reading the cookie store dispatches onto the webview thread and is
        // documented to deadlock if it happens on a synchronous command; this
        // one is async and the read is moved off the runtime thread besides.
        let probe = webview.clone();
        let for_url = url.clone();
        let cookies = tokio::task::spawn_blocking(move || probe.cookies_for_url(for_url))
            .await
            .map_err(|e| CommandError::Internal {
                message: format!("cookie read panicked: {e}"),
            })?;

        let Ok(cookies) = cookies else { continue };

        let harvested: Vec<_> = cookies
            .iter()
            .filter(|c| challenge.cookies.iter().any(|want| want == c.name()))
            .collect();

        if harvested.len() < challenge.cookies.len() {
            continue;
        }

        // Straight into the jar the transport, image proxy and download worker
        // all share — the same writer guest::set_cookie() reaches.
        for cookie in harvested {
            (state.transport.set_cookie)(
                url.as_str(),
                &format!("{}={}", cookie.name(), cookie.value()),
            );
        }

        solved = true;
        break;
    }

    if let Some(view) = app.get_webview(LABEL) {
        let _ = view.close();
    }

    Ok(solved)
}

/// Closes the challenge view without waiting for it to be solved. The pending
/// `solve_challenge` call notices on its next poll and resolves false.
#[tauri::command]
#[specta::specta]
pub async fn cancel_challenge(app: AppHandle) -> CommandResult<()> {
    if let Some(view) = app.get_webview(LABEL) {
        view.close().map_err(|e| CommandError::Internal {
            message: format!("could not close the challenge view: {e}"),
        })?;
    }

    Ok(())
}

/// Keeps the embedded view aligned with the dialog when the window resizes.
#[tauri::command]
#[specta::specta]
pub async fn move_challenge(app: AppHandle, rect: ChallengeRect) -> CommandResult<()> {
    let Some(view) = app.get_webview(LABEL) else {
        return Ok(());
    };

    view.set_position(LogicalPosition::new(rect.x, rect.y))
        .and_then(|_| view.set_size(LogicalSize::new(rect.width, rect.height)))
        .map_err(|e| CommandError::Internal {
            message: format!("could not move the challenge view: {e}"),
        })?;

    Ok(())
}
