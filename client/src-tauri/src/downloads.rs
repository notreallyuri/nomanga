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
use tokio::sync::mpsc;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum DownloadState {
    Queued,
    Downloading,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct DownloadProgress {
    pub source_id: String,
    pub manga_id: String,
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
    target: DownloadTarget,
}

type Key = (String, String, String);

pub struct DownloadManager {
    app: AppHandle,
    tx: mpsc::UnboundedSender<Job>,
    queued: Arc<Mutex<HashSet<Key>>>,
}

impl DownloadManager {
    pub fn new(app: AppHandle, downloads_dir: PathBuf) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let queued: Arc<Mutex<HashSet<Key>>> = Arc::new(Mutex::new(HashSet::new()));

        let client = reqwest::Client::builder()
            .user_agent(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            )
            .build()
            .expect("failed to build http client");

        tauri::async_runtime::spawn(worker(
            app.clone(),
            rx,
            downloads_dir,
            client,
            queued.clone(),
        ));

        Self { app, tx, queued }
    }

    pub fn enqueue(&self, source_id: String, manga_id: String, targets: Vec<DownloadTarget>) {
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
                target,
            });
        }
    }
}

async fn worker(
    app: AppHandle,
    mut rx: mpsc::UnboundedReceiver<Job>,
    downloads_dir: PathBuf,
    client: reqwest::Client,
    queued: Arc<Mutex<HashSet<Key>>>,
) {
    while let Some(job) = rx.recv().await {
        let key = (
            job.source_id.clone(),
            job.manga_id.clone(),
            job.target.chapter_id.clone(),
        );

        if let Err(err) = process(&app, &downloads_dir, &client, &job).await {
            let dir = downloads::chapter_dir(
                &downloads_dir,
                &job.source_id,
                &job.manga_id,
                &job.target.chapter_id,
            );
            let _ = tokio::fs::remove_dir_all(&dir).await;

            emit(
                &app,
                &job.source_id,
                &job.manga_id,
                &job.target.chapter_id,
                &job.target.title,
                DownloadState::Failed,
                0,
                0,
                Some(err),
            );
        }

        queued.lock().unwrap().remove(&key);
    }
}

async fn process(
    app: &AppHandle,
    downloads_dir: &PathBuf,
    client: &reqwest::Client,
    job: &Job,
) -> Result<(), String> {
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

    downloads::record_chapter(&pool, &source_id, &manga_id, &chapter_id, &files, total_bytes)
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

fn source_base_url(registry: &Arc<RwLock<Registry>>, source_id: &str) -> String {
    registry
        .read()
        .ok()
        .and_then(|r| r.source(source_id).ok())
        .map(|h| h.info.base_url)
        .unwrap_or_default()
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
        chapter_id: chapter_id.to_owned(),
        title: title.to_owned(),
        state,
        done,
        total,
        error,
    }
    .emit(app);
}
