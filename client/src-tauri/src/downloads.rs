use nomanga_core::extension::query::ChapterRef;
use nomanga_core::extension::rate_limit::SourceMethod;
use nomanga_host::registry::Registry;
use nomanga_services::downloads::{self, PageFile};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;
use tokio::sync::{mpsc, watch};

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum DownloadState {
    Queued,
    Downloading,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct DownloadProgress {
    pub source_id: String,
    pub manga_id: String,
    pub manga_title: String,
    pub chapter_id: String,
    pub title: String,
    pub state: DownloadState,
    pub done: u32,
    pub total: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct DownloadTarget {
    pub chapter_id: String,
    pub title: String,
}

struct Job {
    source_id: String,
    manga_id: String,
    manga_title: String,
    target: DownloadTarget,
}

type Key = (String, String, String);

pub struct DownloadManager {
    app: AppHandle,
    tx: mpsc::UnboundedSender<Job>,
    queued: Arc<Mutex<HashSet<Key>>>,
    /// Keys the user asked to drop. The queue is an unbounded channel, so a
    /// job cannot be pulled back out of the middle of it — the worker checks
    /// this when the job surfaces, and `process` checks it between pages to
    /// stop one already running.
    cancelled: Arc<Mutex<HashSet<Key>>>,
    paused: watch::Sender<bool>,
}

impl DownloadManager {
    pub fn new(
        app: AppHandle,
        downloads_dir: PathBuf,
        jar: Arc<reqwest::cookie::Jar>,
    ) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let queued: Arc<Mutex<HashSet<Key>>> = Arc::new(Mutex::new(HashSet::new()));
        let cancelled: Arc<Mutex<HashSet<Key>>> = Arc::new(Mutex::new(HashSet::new()));
        let (paused, paused_rx) = watch::channel(false);

        let client = reqwest::Client::builder()
            .user_agent(nomanga_core::extension::common::USER_AGENT)
            .cookie_provider(jar)
            .build()
            .expect("failed to build http client");

        tauri::async_runtime::spawn(worker(
            app.clone(),
            rx,
            downloads_dir,
            client,
            queued.clone(),
            cancelled.clone(),
            paused_rx,
        ));

        Self {
            app,
            tx,
            queued,
            cancelled,
            paused,
        }
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.send_replace(paused);
    }

    pub fn is_paused(&self) -> bool {
        *self.paused.borrow()
    }

    /// Marks one chapter for cancellation whether it is waiting or already
    /// downloading. A job that has already finished is simply not in `queued`,
    /// so this is a no-op for it rather than an error.
    pub fn cancel(&self, source_id: String, manga_id: String, chapter_id: String) {
        let key = (source_id, manga_id, chapter_id);

        if self.queued.lock().unwrap().contains(&key) {
            self.cancelled.lock().unwrap().insert(key);
        }
    }

    pub fn cancel_all(&self) {
        let queued = self.queued.lock().unwrap().clone();
        self.cancelled.lock().unwrap().extend(queued);
    }

    pub fn enqueue(
        &self,
        source_id: String,
        manga_id: String,
        manga_title: String,
        targets: Vec<DownloadTarget>,
    ) {
        for target in targets {
            let key = (source_id.clone(), manga_id.clone(), target.chapter_id.clone());

            {
                let mut queued = self.queued.lock().unwrap();
                if !queued.insert(key) {
                    continue;
                }
            }

            emit(
                &self.app,
                &source_id,
                &manga_id,
                &manga_title,
                &target.chapter_id,
                &target.title,
                DownloadState::Queued,
                0,
                0,
                None,
            );

            let _ = self.tx.send(Job {
                source_id: source_id.clone(),
                manga_id: manga_id.clone(),
                manga_title: manga_title.clone(),
                target,
            });
        }
    }
}

/// Pauses between chapters rather than mid-chapter: a job already running is
/// left to finish, which keeps pause free of the partial-file question that
/// cancel has to answer.
async fn worker(
    app: AppHandle,
    mut rx: mpsc::UnboundedReceiver<Job>,
    downloads_dir: PathBuf,
    client: reqwest::Client,
    queued: Arc<Mutex<HashSet<Key>>>,
    cancelled: Arc<Mutex<HashSet<Key>>>,
    mut paused: watch::Receiver<bool>,
) {
    while let Some(job) = rx.recv().await {
        let key = (
            job.source_id.clone(),
            job.manga_id.clone(),
            job.target.chapter_id.clone(),
        );

        while *paused.borrow() && !cancelled.lock().unwrap().contains(&key) {
            if paused.changed().await.is_err() {
                break;
            }
        }

        let outcome = if cancelled.lock().unwrap().contains(&key) {
            Err(Stopped::Cancelled)
        } else {
            process(&app, &downloads_dir, &client, &cancelled, &key, &job).await
        };

        if let Err(stopped) = outcome {
            // Nothing is recorded until the whole chapter lands, so only files
            // need clearing — a partial directory left behind would read as a
            // complete download.
            let dir = downloads::chapter_dir(
                &downloads_dir,
                &job.source_id,
                &job.manga_id,
                &job.target.chapter_id,
            );
            let _ = tokio::fs::remove_dir_all(&dir).await;

            let (state, error) = match stopped {
                Stopped::Cancelled => (DownloadState::Cancelled, None),
                Stopped::Failed(err) => (DownloadState::Failed, Some(err)),
            };

            emit(
                &app,
                &job.source_id,
                &job.manga_id,
                &job.manga_title,
                &job.target.chapter_id,
                &job.target.title,
                state,
                0,
                0,
                error,
            );
        }

        queued.lock().unwrap().remove(&key);
        cancelled.lock().unwrap().remove(&key);
    }
}

enum Stopped {
    Cancelled,
    Failed(String),
}

impl From<String> for Stopped {
    fn from(message: String) -> Self {
        Self::Failed(message)
    }
}

async fn process(
    app: &AppHandle,
    downloads_dir: &PathBuf,
    client: &reqwest::Client,
    cancelled: &Arc<Mutex<HashSet<Key>>>,
    key: &Key,
    job: &Job,
) -> Result<(), Stopped> {
    let state = app.state::<AppState>();
    let pool = state.pool.clone();
    let registry = state.registry.clone();

    let (source_id, manga_id, chapter_id) = (
        job.source_id.clone(),
        job.manga_id.clone(),
        job.target.chapter_id.clone(),
    );

    let pages = fetch_page_list(&registry, &source_id, &manga_id, &chapter_id).await?;
    let base_url = source_base_url(&registry, &source_id);
    let total = pages.len() as u32;

    let progress = |state: DownloadState, done: u32| {
        emit(
            app,
            &source_id,
            &manga_id,
            &job.manga_title,
            &chapter_id,
            &job.target.title,
            state,
            done,
            total,
            None,
        );
    };

    progress(DownloadState::Downloading, 0);

    let dir = downloads::chapter_dir(downloads_dir, &source_id, &manga_id, &chapter_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;

    let mut files = Vec::with_capacity(pages.len());
    let mut total_bytes = 0u64;

    for (index, page) in pages.iter().enumerate() {
        if cancelled.lock().unwrap().contains(key) {
            return Err(Stopped::Cancelled);
        }

        let resp = client
            .get(&page.image_url)
            .header(reqwest::header::REFERER, &base_url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?;

        let ext = pick_extension(&page.image_url, resp.headers());
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

        let file = dir.join(format!("{:04}.{ext}", page.number));
        tokio::fs::write(&file, &bytes)
            .await
            .map_err(|e| e.to_string())?;

        let rel = file
            .strip_prefix(downloads_dir)
            .unwrap_or(&file)
            .to_string_lossy()
            .into_owned();

        total_bytes += bytes.len() as u64;
        files.push(PageFile {
            number: page.number,
            path: rel,
        });

        progress(DownloadState::Downloading, index as u32 + 1);
    }

    downloads::record_chapter(
        &pool,
        &source_id,
        &manga_id,
        &chapter_id,
        &job.target.title,
        &files,
        total_bytes,
    )
    .await
    .map_err(|e| e.to_string())?;

    progress(DownloadState::Done, total);
    Ok(())
}

async fn fetch_page_list(
    registry: &Arc<RwLock<Registry>>,
    source_id: &str,
    manga_id: &str,
    chapter_id: &str,
) -> Result<Vec<nomanga_core::data::chapter::Page>, String> {
    let handle = registry
        .read()
        .map_err(|_| "registry poisoned".to_string())?
        .source(source_id)
        .map_err(|e| e.to_string())?;

    let sid = source_id.to_owned();
    let chapter = ChapterRef {
        manga_id: manga_id.to_owned(),
        chapter_id: chapter_id.to_owned(),
    };

    tokio::task::spawn_blocking(move || {
        handle.throttled(SourceMethod::Pages, |ext| ext.pages(&sid, chapter))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

pub fn source_base_url(registry: &Arc<RwLock<Registry>>, source_id: &str) -> String {
    let declared = registry
        .read()
        .ok()
        .and_then(|r| r.source(source_id).ok())
        .map(|h| h.info.base_url)
        .unwrap_or_default();

    as_referer(declared)
}

/// Sent as a Referer, so it has to look like one. A source declaring
/// `https://host` with no path would otherwise produce a header no browser ever
/// sends, and hotlink checks that string-match the site root reject it:
/// manganato.gg's CDN serves `https://www.manganato.gg/` and 403s the same URL
/// without the slash. Parsing and re-serialising supplies the empty path and
/// leaves a declared path alone.
fn as_referer(declared: String) -> String {
    declared
        .parse::<reqwest::Url>()
        .map(|url| url.to_string())
        .unwrap_or(declared)
}

#[cfg(test)]
mod referer_tests {
    use super::as_referer;

    #[test]
    fn supplies_the_empty_path_without_touching_a_real_one() {
        // The case that broke covers: bare origin gets its slash.
        assert_eq!(
            as_referer("https://www.manganato.gg".into()),
            "https://www.manganato.gg/"
        );
        // Already correct, and must not gain a second slash.
        assert_eq!(
            as_referer("https://www.manganato.gg/".into()),
            "https://www.manganato.gg/"
        );
        // A source that declares a path keeps exactly that path — appending a
        // slash here would break the referer for a site that checks it.
        assert_eq!(
            as_referer("https://www.webtoons.com/en".into()),
            "https://www.webtoons.com/en"
        );
        // Anything unparseable is passed through rather than dropped.
        assert_eq!(as_referer(String::new()), "");
    }
}

fn pick_extension(url: &str, headers: &reqwest::header::HeaderMap) -> String {
    const ALLOWED: [&str; 6] = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

    let from_url = url
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, ext)| ext.split(['?', '#']).next().unwrap_or(ext).to_ascii_lowercase())
        .filter(|ext| ALLOWED.contains(&ext.as_str()));

    if let Some(ext) = from_url {
        return ext;
    }

    let from_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split('/').nth(1))
        .map(|s| s.split(['+', ';']).next().unwrap_or(s).to_ascii_lowercase())
        .filter(|ext| ALLOWED.contains(&ext.as_str()));

    from_type.unwrap_or_else(|| "jpg".to_owned())
}

#[allow(clippy::too_many_arguments)]
fn emit(
    app: &AppHandle,
    source_id: &str,
    manga_id: &str,
    manga_title: &str,
    chapter_id: &str,
    title: &str,
    state: DownloadState,
    done: u32,
    total: u32,
    error: Option<String>,
) {
    let _ = DownloadProgress {
        source_id: source_id.to_owned(),
        manga_id: manga_id.to_owned(),
        manga_title: manga_title.to_owned(),
        chapter_id: chapter_id.to_owned(),
        title: title.to_owned(),
        state,
        done,
        total,
        error,
    }
    .emit(app);
}
