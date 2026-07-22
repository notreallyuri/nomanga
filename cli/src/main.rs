use std::collections::HashMap;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
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
        query: String,
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

    let mut ext = meta.activate(meta.all_hosts(), HashMap::new())?;

    let value = match cli.command {
        Command::Info => unreachable!("handled above"),
        Command::Homepage => to_value(ext.homepage(source)?, cli.json)?,
        Command::Filters => to_value(ext.filters(source)?, cli.json)?,
        Command::Search { query, page } => {
            let q = SearchQuery {
                query,
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
