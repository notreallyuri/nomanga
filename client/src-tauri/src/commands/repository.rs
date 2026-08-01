use nomanga_core::extension::repository::RepositoryIndex;
use nomanga_services::extension::repository::{self, Repository};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{CommandError, CommandResult};
use crate::AppState;

// A repository is an arbitrary URL the user pasted, so both fetches are bounded
// rather than trusted: an index that streams forever, or a `.wasm` sized to
// fill the disk, would otherwise be a denial of service with no attacker
// sophistication at all.
const MAX_INDEX_BYTES: usize = 4 * 1024 * 1024;
const MAX_WASM_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RepositoryCatalog {
    pub repository: Repository,
    pub index: Option<RepositoryIndex>,
    pub error: Option<String>,
    /// Ids from this index whose ABI this app cannot load, resolved here so the
    /// frontend never has to carry a copy of the supported range.
    pub unsupported: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn list_repositories(state: State<'_, AppState>) -> CommandResult<Vec<Repository>> {
    Ok(repository::list(&state.pool).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn add_repository(
    state: State<'_, AppState>,
    url: String,
) -> CommandResult<RepositoryIndex> {
    let url = normalize_url(&url)?;
    let index = fetch_index(&state.http, &url).await?;

    repository::add(&state.pool, &url, &index.name).await?;
    repository::mark_fetched(&state.pool, &url, &index.name).await?;

    Ok(index)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_repository(state: State<'_, AppState>, url: String) -> CommandResult<()> {
    repository::remove(&state.pool, &url).await?;
    Ok(())
}

/// Fetches every repository, reporting per-repository failures in the row
/// rather than as an error, so one unreachable link does not blank the list.
#[tauri::command]
#[specta::specta]
pub async fn browse_repositories(
    state: State<'_, AppState>,
) -> CommandResult<Vec<RepositoryCatalog>> {
    let repositories = repository::list(&state.pool).await?;
    let mut catalogs = Vec::with_capacity(repositories.len());

    for row in repositories {
        match fetch_index(&state.http, &row.url).await {
            Ok(index) => {
                repository::mark_fetched(&state.pool, &row.url, &index.name).await?;

                let unsupported = index
                    .extensions
                    .iter()
                    .filter(|e| !e.abi_supported())
                    .map(|e| e.info.id.clone())
                    .collect();

                catalogs.push(RepositoryCatalog {
                    repository: row,
                    index: Some(index),
                    error: None,
                    unsupported,
                });
            }
            Err(e) => catalogs.push(RepositoryCatalog {
                repository: row,
                index: None,
                error: Some(e.to_string()),
                unsupported: Vec::new(),
            }),
        }
    }

    Ok(catalogs)
}

/// Takes the extension's id rather than a download URL so the app only ever
/// fetches a binary a registered repository's own index points at — the
/// frontend cannot name an arbitrary URL to install from.
#[tauri::command]
#[specta::specta]
pub async fn install_from_repository(
    state: State<'_, AppState>,
    url: String,
    extension_id: String,
) -> CommandResult<String> {
    let index = fetch_index(&state.http, &url).await?;

    let entry = index
        .extensions
        .iter()
        .find(|e| e.info.id == extension_id)
        .ok_or_else(|| CommandError::Extension {
            message: format!("{extension_id} is not offered by this repository"),
        })?;

    if !entry.abi_supported() {
        return Err(CommandError::Extension {
            message: format!(
                "{} targets abi {}, which this version of nomanga cannot load",
                entry.info.name, entry.info.abi_version
            ),
        });
    }

    let download_url = resolve_url(&url, &entry.download_url)?;
    let bytes = fetch_bounded(&state.http, &download_url, MAX_WASM_BYTES).await?;

    let temp = std::env::temp_dir().join(format!("{extension_id}.download.wasm"));
    std::fs::write(&temp, &bytes).map_err(|e| CommandError::Io {
        message: format!("could not stage the download: {e}"),
    })?;

    let installed = install_staged(&state, &temp).await;
    std::fs::remove_file(&temp).ok();

    installed
}

async fn install_staged(
    state: &State<'_, AppState>,
    path: &std::path::Path,
) -> CommandResult<String> {
    let configs = nomanga_services::source::config::all_configs(&state.pool).await?;
    let enabled = nomanga_services::source::preference::enabled_ids(&state.pool).await?;

    let mut registry = state.registry.write()?;
    let info = registry.install(path, &configs)?;
    registry.set_enabled(&enabled)?;

    Ok(info.id)
}

fn normalize_url(url: &str) -> CommandResult<String> {
    let url = url.trim();

    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(CommandError::Extension {
            message: "a repository URL must start with https:// or http://".into(),
        });
    }

    Ok(url.trim_end_matches('/').to_owned())
}

/// Lets an index publish `extension.wasm` beside itself instead of repeating an
/// absolute URL, which is what makes an index usable from a release asset whose
/// host is not known when the file is written.
fn resolve_url(index_url: &str, target: &str) -> CommandResult<String> {
    if target.starts_with("https://") || target.starts_with("http://") {
        return Ok(target.to_owned());
    }

    let base = index_url
        .rsplit_once('/')
        .map(|(base, _)| base)
        .ok_or_else(|| CommandError::Extension {
            message: format!("cannot resolve {target} against {index_url}"),
        })?;

    Ok(format!("{base}/{}", target.trim_start_matches("./")))
}

async fn fetch_index(http: &reqwest::Client, url: &str) -> CommandResult<RepositoryIndex> {
    let bytes = fetch_bounded(http, url, MAX_INDEX_BYTES).await?;

    serde_json::from_slice(&bytes).map_err(|e| CommandError::Extension {
        message: format!("{url} did not return a nomanga repository index: {e}"),
    })
}

async fn fetch_bounded(http: &reqwest::Client, url: &str, limit: usize) -> CommandResult<Vec<u8>> {
    use futures_util::StreamExt;

    let response = http
        .get(url)
        .send()
        .await
        .map_err(|e| CommandError::Extension {
            message: format!("could not reach {url}: {e}"),
        })?;

    if !response.status().is_success() {
        return Err(CommandError::Extension {
            message: format!("{url} returned {}", response.status()),
        });
    }

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CommandError::Extension {
            message: format!("download from {url} failed: {e}"),
        })?;

        if body.len() + chunk.len() > limit {
            return Err(CommandError::Extension {
                message: format!("{url} is larger than the {} MB limit", limit / 1024 / 1024),
            });
        }

        body.extend_from_slice(&chunk);
    }

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    /// Serves `body` once at `/index.min.json` and returns the URL. Kept to a
    /// raw socket so the test exercises the real reqwest path without pulling
    /// in an HTTP server just for it.
    fn serve_once(body: Vec<u8>) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();

            // Drained, not parsed: the request is always the same GET, but
            // answering without reading it can reset the connection under the
            // client while it is still writing. A short read means the whole
            // request has arrived, and 0 means the peer gave up.
            let mut scratch = [0_u8; 1024];
            while let Ok(n) = stream.read(&mut scratch) {
                if n < scratch.len() {
                    break;
                }
            }

            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(header.as_bytes()).ok();
            stream.write_all(&body).ok();
            stream.flush().ok();
        });

        format!("http://127.0.0.1:{port}/index.min.json")
    }

    fn sample_index() -> String {
        serde_json::json!({
            "index_version": 1,
            "name": "Test pack",
            "extensions": [{
                "info": {
                    "id": "dev.test.pack",
                    "name": "Test Pack",
                    "version": "0.1.0",
                    "abi_version": nomanga_core::extension::source::ABI_VERSION,
                    "author": "test",
                    "website": null
                },
                "download_url": "extension_test.wasm",
                "sources": []
            }]
        })
        .to_string()
    }

    #[tokio::test]
    async fn fetches_and_parses_an_index_over_http() {
        let url = serve_once(sample_index().into_bytes());
        let index = fetch_index(&reqwest::Client::new(), &url).await.unwrap();

        assert_eq!(index.name, "Test pack");
        assert!(index.extensions[0].abi_supported());
        assert_eq!(
            resolve_url(&url, &index.extensions[0].download_url).unwrap(),
            url.replace("index.min.json", "extension_test.wasm")
        );
    }

    #[tokio::test]
    async fn refuses_a_body_over_the_limit() {
        let url = serve_once(vec![b'x'; 4096]);
        let err = fetch_bounded(&reqwest::Client::new(), &url, 1024)
            .await
            .unwrap_err();

        assert!(err.to_string().contains("larger than"), "{err}");
    }

    #[tokio::test]
    async fn reports_a_body_that_is_not_an_index() {
        let url = serve_once(b"<html>not json</html>".to_vec());
        let err = fetch_index(&reqwest::Client::new(), &url)
            .await
            .unwrap_err();

        assert!(err.to_string().contains("repository index"), "{err}");
    }

    #[test]
    fn rejects_a_url_that_is_not_http() {
        assert!(normalize_url("file:///etc/passwd").is_err());
        assert!(normalize_url("aidoku://add").is_err());
        assert!(normalize_url("  https://example.org/index.json/ ").is_ok());
    }

    #[test]
    fn resolves_a_download_beside_the_index() {
        let index = "https://user.github.io/pack/index.min.json";

        assert_eq!(
            resolve_url(index, "extension_mainpack.wasm").unwrap(),
            "https://user.github.io/pack/extension_mainpack.wasm"
        );
        assert_eq!(
            resolve_url(index, "./extension_mainpack.wasm").unwrap(),
            "https://user.github.io/pack/extension_mainpack.wasm"
        );
        assert_eq!(
            resolve_url(index, "https://cdn.example.org/pack.wasm").unwrap(),
            "https://cdn.example.org/pack.wasm"
        );
    }
}
