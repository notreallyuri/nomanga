//! Serves remote source images through a custom URI scheme so the request can
//! carry a `Referer` header.
//!
//! Several sources hotlink-protect their image CDNs and 403 anything that does
//! not arrive with the site's own referer (NatoManga covers and pages, WEBTOON
//! pages). The download worker already sets it, but an `<img src>` rendered in
//! the webview sends the app's own origin, and `referrerPolicy` can only reduce
//! a referer — never forge a cross-origin one. So the fetch has to happen in the
//! backend, where the header is ours to set.
//!
//! Requests look like `srcimg://localhost/<source_id>?url=<encoded image url>`;
//! the source id is what resolves the referer, via the registry's `base_url`.

use crate::AppState;
use nomanga_services::cache::image as image_cache;
use tauri::{
    http::{Request, Response, StatusCode},
    Manager, Runtime, UriSchemeContext, UriSchemeResponder,
};

pub const SCHEME: &str = "srcimg";

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();

    let Some((source_id, image_url, cacheable)) = parse_request(request.uri()) else {
        responder.respond(error(StatusCode::BAD_REQUEST));
        return;
    };

    // Only ever proxy http(s); without this the scheme would happily read
    // `file://` URLs back out of the host.
    if !(image_url.starts_with("https://") || image_url.starts_with("http://")) {
        responder.respond(error(StatusCode::BAD_REQUEST));
        return;
    }

    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();

        let limit = state
            .settings
            .read()
            .ok()
            .and_then(|s| s.system.image_cache_limit.bytes())
            .filter(|_| cacheable);

        if limit.is_some() {
            if let Ok(Some((bytes, content_type))) =
                image_cache::read(&state.pool, &state.image_cache_dir, &image_url).await
            {
                responder.respond(image(bytes, content_type));
                return;
            }
        }

        let referer = crate::downloads::source_base_url(&state.registry, &source_id);
        let client = state.http.clone();

        let mut req = client.get(&image_url);
        if !referer.is_empty() {
            req = req.header(reqwest::header::REFERER, referer);
        }

        let response = match req.send().await {
            Ok(r) if r.status().is_success() => r,
            // A non-2xx from the CDN is not an app error — pass the status
            // through so the reader's retry logic sees the real story.
            Ok(r) => {
                responder.respond(error(
                    StatusCode::from_u16(r.status().as_u16())
                        .unwrap_or(StatusCode::BAD_GATEWAY),
                ));
                return;
            }
            Err(_) => {
                responder.respond(error(StatusCode::BAD_GATEWAY));
                return;
            }
        };

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_owned();

        let Ok(bytes) = response.bytes().await else {
            responder.respond(error(StatusCode::BAD_GATEWAY));
            return;
        };

        responder.respond(image(bytes.to_vec(), content_type.clone()));

        // Persisting is deliberately after the response so a slow disk never
        // delays first paint.
        if let Some(max_bytes) = limit {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app.state::<AppState>();
                image_cache::write(
                    &state.pool,
                    &state.image_cache_dir,
                    &image_url,
                    &content_type,
                    &bytes,
                    max_bytes,
                )
                .await
                .ok();
            });
        }
    });
}

fn image(bytes: Vec<u8>, content_type: String) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Access-Control-Allow-Origin", "*")
        // Source images are content-addressed and effectively immutable, so let
        // the webview keep them.
        .header("Cache-Control", "public, max-age=86400")
        .body(bytes)
        .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR))
}

/// `srcimg://localhost/<source_id>?url=…` on Linux and macOS,
/// `http://srcimg.localhost/<source_id>?url=…` on Windows — parsing the whole
/// URI rather than the path alone keeps both shapes working.
fn parse_request(uri: &tauri::http::Uri) -> Option<(String, String, bool)> {
    let parsed = tauri::Url::parse(&uri.to_string()).ok()?;

    let source_id = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(|s| percent_decode(s))
        .filter(|s| !s.is_empty())?;

    let image_url = parsed
        .query_pairs()
        .find(|(key, _)| key == "url")
        .map(|(_, value)| value.into_owned())
        .filter(|s| !s.is_empty())?;

    // Opt-in per call site: only covers are worth keeping on disk, and reader
    // pages would swamp the cache within a single chapter.
    let cacheable = parsed
        .query_pairs()
        .any(|(key, value)| key == "cache" && value == "1");

    Some((source_id, image_url, cacheable))
}

fn percent_decode(value: &str) -> String {
    percent_encoding::percent_decode_str(value)
        .decode_utf8_lossy()
        .into_owned()
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .expect("static error response is always valid")
}
