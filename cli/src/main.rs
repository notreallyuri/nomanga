use std::collections::HashMap;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use nomanga_core::extension::common::{HostRequest, HostResponse};
use nomanga_host::transport::{CallLog, TransportShared};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use nomanga_core::extension::query::{ChapterRef, MangaRef, SearchQuery};
use nomanga_host::ExtensionMetadata;

#[derive(Parser)]
#[command(name = "nomanga-cli", about = "Run and inspect nomanga extensions")]
struct Cli {
    #[arg(long, global = true)]
    wasm: Option<String>,
    #[arg(long, short, global = true)]
    source: Option<String>,
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Info,
    Homepage,
    Filters,
    Search {
        term: String,
        #[arg(long, default_value_t = 1)]
        page: u32,
    },
    Manga {
        manga_id: String,
    },
    Chapters {
        manga_id: String,
    },
    Pages {
        manga_id: String,
        chapter_id: String,
    },
    Section {
        section_id: String,
        #[arg(long, default_value_t = 1)]
        page: u32,
    },
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let wasm = cli.wasm.as_deref().ok_or("--wasm <path> is required")?;

    let meta = ExtensionMetadata::inspect(wasm)?;

    if let Command::Info = cli.command {
        print_info(&meta);
        return Ok(());
    }

    let source = cli
        .source
        .as_deref()
        .ok_or("--source <id> is required for this command (try `info` to list sources)")?;

    let transport = blocking_transport();
    let mut ext = meta.activate(
        meta.all_hosts(),
        HashMap::new(),
        transport.context(meta.all_hosts()),
    )?;

    let value = match cli.command {
        Command::Info => unreachable!("handled above"),
        Command::Homepage => to_value(ext.homepage(source)?, cli.json)?,
        Command::Filters => to_value(ext.filters(source)?, cli.json)?,
        Command::Search { term, page } => {
            let q = SearchQuery {
                term,
                page,
                filters: vec![],
            };
            to_value(ext.search(source, q)?, cli.json)?
        }
        Command::Manga { manga_id } => {
            to_value(ext.manga(source, MangaRef { manga_id })?, cli.json)?
        }
        Command::Chapters { manga_id } => {
            to_value(ext.chapters(source, MangaRef { manga_id })?, cli.json)?
        }
        Command::Pages {
            manga_id,
            chapter_id,
        } => to_value(
            ext.pages(
                source,
                ChapterRef {
                    manga_id,
                    chapter_id,
                },
            )?,
            cli.json,
        )?,
        Command::Section { section_id, page } => {
            use nomanga_core::extension::query::SectionRef;
            to_value(
                ext.section(source, SectionRef { section_id, page })?,
                cli.json,
            )?
        }
    };

    println!("{value}");
    Ok(())
}

fn to_value<T: serde::Serialize>(v: T, json: bool) -> Result<String, serde_json::Error> {
    if json {
        serde_json::to_string(&v)
    } else {
        serde_json::to_string_pretty(&v)
    }
}

fn print_info(meta: &ExtensionMetadata) {
    let e = &meta.extension;
    println!("{} v{}  (abi {})", e.name, e.version, e.abi_version);
    println!(
        "by {}{}",
        e.author,
        e.website
            .as_deref()
            .map(|w| format!("  <{w}>"))
            .unwrap_or_default()
    );
    println!("\nsources ({}):", meta.sources.len());
    for s in &meta.sources {
        let nsfw = if s.nsfw { "  [nsfw]" } else { "" };
        println!("  {:<28} {}  ({}){}", s.id, s.name, s.language, nsfw);
    }
    println!("\ndeclared hosts:");
    for h in meta.all_hosts() {
        println!("  {h}");
    }
}

/// The CLI has no async runtime, so extension requests go out through a plain
/// blocking client rather than the app's reqwest bridge.
fn blocking_transport() -> TransportShared {
    let jar: Jar = Arc::new(std::sync::Mutex::new(Vec::new()));
    let fetch_jar = jar.clone();

    TransportShared {
        fetch: Arc::new(move |request: HostRequest| {
            let mut builder = ureq::http::Request::builder()
                .method(request.method.as_str())
                .uri(&request.url);
            for (key, value) in &request.headers {
                builder = builder.header(key, value);
            }

            if !request
                .headers
                .iter()
                .any(|(k, _)| k.eq_ignore_ascii_case("cookie"))
                && let Some(header) = cookie_header(&fetch_jar, &request.url)
            {
                builder = builder.header("Cookie", header);
            }

            let built = builder.body(request.body.unwrap_or_default());
            let sent = match built {
                Ok(req) => ureq::run(req),
                Err(e) => return transport_failure(&e.to_string()),
            };

            let mut response = match sent {
                Ok(response) => response,
                Err(e) => return transport_failure(&e.to_string()),
            };

            let status = response.status().as_u16();
            let headers: Vec<(String, String)> = response
                .headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_owned()))
                .collect();

            for (key, value) in &headers {
                if key.eq_ignore_ascii_case("set-cookie") {
                    store_cookie(&fetch_jar, &request.url, value);
                }
            }

            match response.body_mut().read_to_vec() {
                Ok(body) => HostResponse {
                    status,
                    headers,
                    body,
                    transport_error: None,
                },
                Err(e) => transport_failure(&e.to_string()),
            }
        }),
        set_cookie: Arc::new(move |url, cookie| store_cookie(&jar, url, cookie)),
        random_hex: Arc::new(|bytes| {
            // No rand dependency here; the CLI only needs a nonce that differs
            // between runs, not an unpredictable one.
            let seed = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            (0..bytes)
                .map(|i| format!("{:02x}", (seed >> (i % 16 * 8)) as u8 ^ i as u8))
                .collect()
        }),
        log: Arc::new(CallLog::default()),
        recording: Arc::new(AtomicBool::new(false)),
    }
}

fn host_of(url: &str) -> &str {
    url.split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .unwrap_or(url)
}

type Jar = Arc<std::sync::Mutex<Vec<(String, String, String)>>>;

/// Stores one `Set-Cookie` value, keyed by its `Domain` attribute or, without
/// one, the host it came from.
fn store_cookie(jar: &Jar, url: &str, cookie: &str) {
    let mut parts = cookie.split(';');
    let Some((name, value)) = parts.next().and_then(|pair| pair.trim().split_once('=')) else {
        return;
    };

    let domain = parts
        .filter_map(|attr| attr.trim().split_once('='))
        .find(|(k, _)| k.eq_ignore_ascii_case("domain"))
        .map(|(_, v)| v.trim().trim_start_matches('.').to_owned())
        .unwrap_or_else(|| host_of(url).to_owned());

    let Ok(mut jar) = jar.lock() else { return };
    jar.retain(|(d, n, _)| !(d == &domain && n == name));
    jar.push((domain, name.to_owned(), value.to_owned()));
}

fn cookie_header(jar: &Jar, url: &str) -> Option<String> {
    let host = host_of(url);
    let jar = jar.lock().ok()?;

    let header = jar
        .iter()
        .filter(|(domain, _, _)| host == domain || host.ends_with(&format!(".{domain}")))
        .map(|(_, name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");

    (!header.is_empty()).then_some(header)
}

fn transport_failure(message: &str) -> HostResponse {
    HostResponse {
        status: 0,
        headers: Vec::new(),
        body: Vec::new(),
        transport_error: Some(message.to_owned()),
    }
}
