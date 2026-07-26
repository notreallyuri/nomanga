# nomanga

A cross-platform manga reader with a sandboxed, WASM-based extension system.

Sources (the sites manga is fetched from) are not baked into the app — they ship
as WebAssembly plugins that run in an [Extism](https://extism.org) sandbox with an
explicit allow-list of hosts they may reach. The desktop app is built with
Tauri + React; everything below the UI is Rust.

> **Status:** early but usable. The engine, extension ABI, host, and SQLite
> persistence layer are in place, and the desktop UI now covers browsing, a
> categorized library, a multi-layout reader, and read history. Source
> extensions ship for WeebCentral and MangaDex.

## How it works

```
┌─────────────────────────────────────────────┐
│  client (Tauri v2 + React 19 + Vite)        │  UI
│  └─ src-tauri  ── #[tauri::command]s ───────┼──► TypeScript bindings
│                                             │    auto-exported via specta
├─────────────────────────────────────────────┤
│  nomanga-services   SQLite (sqlx)           │  library · history · settings
│  nomanga-host       Extism host + registry  │  loads & calls .wasm sources
│  nomanga-core       shared data model + ABI │  the contract both sides share
├─────────────────────────────────────────────┤
│  *.wasm sources  (sandboxed, host-allowlist)│  built with nomanga-sdk
└─────────────────────────────────────────────┘
```

A **source** implements the `Source` trait (`homepage`, `search`, `manga`,
`chapters`, `pages`, …). One WASM **extension** can bundle several sources. The
host inspects an extension, checks its `abi_version`, then activates it with only
the network hosts it declares. Identity everywhere is the `(source_id, manga_id)`
pair — the same natural key the ABI and the database use, so source calls and DB
rows line up with no translation layer.

## Features

- **Library** — categories with drag-to-reorder, private (hidden from *All*) and
  default shelves, per-category sort, and an accent colour/icon per shelf. Add a
  series straight into categories, edit an entry's shelves, or multi-select for
  bulk category changes and removal.
- **Reader** — single/double-page and vertical-scroll (webtoon) layouts, zoom
  modes, reading direction, and a page scrubber. Reader settings resolve through
  a **Global → Source → Manga** hierarchy, so a single title or a whole source
  can override the defaults; editable from the reader or the manga page.
- **Browse & search** — per-source homepage sections and search with searchable
  multi-select filters that apply once you close the filter sheet.
- **History** — reading history grouped by day, then week, then month, with
  *Continue reading* that resumes at the exact page you left off on.
- **Sandboxed sources** — every extension runs in a WASM sandbox and may only
  reach the network hosts it declares up front.

## Workspace layout

| Crate / dir | Name | Role |
|---|---|---|
| `packages/core` | `nomanga-core` | Shared data model (`Manga`, `Chapter`, `Page`, `Homepage`) and the extension ABI types (`SourceInfo`, filters, settings, query refs). The `typescript` feature derives specta types. |
| `packages/host` | `nomanga-host` | Extism host. `ExtensionMetadata::inspect`/`activate`, `LoadedExtension`, and a `Registry` that scans a directory of `.wasm` files and exposes sources by id. |
| `packages/sdk` | `nomanga-sdk` | Guest-side SDK for writing sources: the `register_sources!` macro (generates the plugin exports), a `Request` HTTP builder with `get_text`/`get_json`, source-config accessors (`setting_*`), and HTML-scraping utilities (`parse`, backed by `scraper`). Declarative builders keep large source definitions readable — `Setting::*` and `Filter::*` constructors, `SelectOption::list`, and the `FilterValues` trait for reading a user's selections back by id. |
| `packages/services` | `nomanga-services` | SQLite persistence via `sqlx`: library, categories, read history & resume progress, per-source preferences, reader-setting overrides, and app settings. Ships migrations. |
| `cli` | `nomanga-cli` | Dev CLI to inspect and run an extension `.wasm` without the app. |
| `extensions/extension_example` | `extension_example` | Example extension bundling WeebCentral and MangaDex sources, compiled to `wasm32-unknown-unknown`. |
| `client` | Tauri app | React/Vite frontend and the `src-tauri` backend that wires services + host into `#[tauri::command]`s. |

### Data & persistence

SQLite (via `sqlx`, compile-time-checked queries) stores:

- **manga** — cached metadata, populated on any fetch (library or not)
- **library_entry** / **category** / **library_entry_category** — the user's
  saved series and the shelves they belong to (a many-to-many join)
- **category options** — per shelf: private (hidden from *All*), a default shelf
  new additions join, a sort mode, and an accent colour + icon
- **read_chapter** — per-chapter read state (a real table, so "is X read?" is a
  query)
- **read_progress** — last chapter/page per manga, powering *Continue reading*
- **reader_override** — per-source and per-manga reader-setting overrides that
  layer on top of the global defaults
- **source_preference** — enable/hide, blur covers, skip updates

Rust command signatures and types are exported to `client/src/types/bindings.ts`
automatically (via `tauri-specta` / `specta`) on every debug build, so the
frontend stays type-safe against the backend.

## Building & running

Prerequisites: a Rust toolchain (edition 2024), `pnpm`, and the
[Tauri v2 system dependencies](https://tauri.app/start/prerequisites/) for your OS.

### Desktop app

```sh
cd client
pnpm install
pnpm tauri dev        # run the app
pnpm tauri build      # production bundle
```

### Building an extension

Extensions target WebAssembly:

```sh
rustup target add wasm32-unknown-unknown
cargo build -p extension_example --release --target wasm32-unknown-unknown
# → target/wasm32-unknown-unknown/release/extension_example.wasm
```

The app loads `.wasm` files from its extensions directory (under the platform
app-data dir); `Registry::install` copies an extension in and activates it.

### Inspecting / testing with the CLI

Run source calls against a built `.wasm` without launching the app:

```sh
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm info
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm --source <id> homepage
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm --source <id> search "spy family"
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm --source <id> manga <manga_id>
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm --source <id> chapters <manga_id>
cargo run -p nomanga-cli -- --wasm path/to/extension.wasm --source <id> pages <manga_id> <chapter_id>
```

Add `--json` for compact machine-readable output.

## Writing a source

Implement `Source` for your type and register it with the macro. The SDK's
`parse` and `guest` helpers cover the common scrape-and-map path, and the
`Filter::*` / `Setting::*` builders keep declarations readable:

```rust
use nomanga_sdk::prelude::*;

struct MySource;

impl Source for MySource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "example".into(),
            name: "Example".into(),
            version: "0.1.0".into(),
            language: "en".into(),
            base_url: "https://example.org".into(),
            icon_url: None,
            hosts: vec!["example.org".into()], // network allow-list
            nsfw: false,
        }
    }

    // Filters are declared with builders; the user's picks come back as
    // FilterValues you read by id in `search`.
    fn filters(&self) -> Vec<Filter> {
        vec![
            Filter::sort("sort", "Sort", SelectOption::list(["Popularity", "Latest"]))
                .with_default("Popularity"),
            Filter::multi_select(
                "status",
                "Status",
                SelectOption::list([("ongoing", "Ongoing"), ("completed", "Completed")]),
            ),
        ]
    }

    fn search(&self, query: SearchQuery) -> SourceResult<MangaPage> {
        let filters = query.filters.as_slice();
        let mut url = format!("https://example.org/search?q={}", encode_query(&query.term));

        if let Some((sort, _)) = filters.sort("sort") {
            url.push_str(&format!("&sort={sort}"));
        }
        for status in filters.included("status") {
            url.push_str(&format!("&status={status}"));
        }

        let _html = guest::get_text(&url)?;
        /* parse into a MangaPage … */
    }

    fn homepage(&self) -> SourceResult<Homepage> { /* ... */ }
    fn manga(&self, m: MangaRef) -> SourceResult<Manga> { /* ... */ }
    fn chapters(&self, m: MangaRef) -> SourceResult<Vec<Chapter>> { /* ... */ }
    fn pages(&self, c: ChapterRef) -> SourceResult<Vec<Page>> { /* ... */ }
}

nomanga_sdk::register_sources! {
    extension: ExtensionInfo {
        id: "dev.example.pack".into(),
        name: "Example Pack".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        abi_version: ABI_VERSION,
        author: "you".into(),
        website: None,
    },
    sources: [MySource],
}
```

Sources can also expose user-configurable settings (API keys, language, content
ratings) with the `Setting::*` builders and read them back with `guest::setting_*`;
see `extensions/extension_example` for complete working sources (WeebCentral and
MangaDex).

## Tech stack

Rust (workspace, edition 2024) · [Extism](https://extism.org) (WASM host/PDK) ·
[Tauri v2](https://tauri.app) · React 19 + Vite + TypeScript ·
[sqlx](https://github.com/launchbadge/sqlx) + SQLite ·
[specta](https://github.com/specta-rs/specta) / tauri-specta ·
`scraper` for HTML parsing.
