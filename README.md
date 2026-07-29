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

Queries are checked at compile time, so building without a database relies on
the committed cache in `packages/services/.sqlx`. After changing any `sqlx::query*!`
macro, regenerate it:

```sh
cd packages/services
cargo sqlx prepare -- --all-targets   # needs DATABASE_URL (see .env.example)
```

`--all-targets` is what includes queries that only appear in tests; without it
the app still builds but `SQLX_OFFLINE=true cargo test` fails on the missing
entries. Commit the resulting `.sqlx` changes — CI has no database and sets
`SQLX_OFFLINE=true`.

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

### Packaged builds

The `Build` workflow (Actions → Build → Run workflow) builds on Linux, macOS,
and Windows, and uploads the bundles as artifacts.

| Platform | Artifact | Notes |
|---|---|---|
| Windows | `.exe` (NSIS), `.msi` | Unsigned — SmartScreen shows a dismissible warning. |
| macOS | `.dmg` (universal) | Unsigned — Gatekeeper **refuses** to open it. Right-click → Open, or `xattr -dr com.apple.quarantine /Applications/nomanga.app`. |
| Linux | `.deb`, `.AppImage` | Built on Ubuntu 24.04, so glibc 2.39 or newer. |
| Linux | `.rpm` | ⚠️ **Untested.** Built on Ubuntu, not Fedora — the file is produced, but its dependency names come from Tauri's list rather than Fedora's, so it may not resolve on install. |

On Arch, use `packaging/arch/PKGBUILD` instead of any of the above. Do not build
the AppImage locally: linuxdeploy's GTK plugin copies
`/usr/lib/gdk-pixbuf-2.0/2.10.0`, which `gdk-pixbuf2` 2.44 no longer ships, so
`pnpm tauri build` fails at the bundling step. Pass `--no-bundle` (as the
PKGBUILD does) or `--bundles deb`. `packaging/install-local.sh` registers a dev
build with your desktop environment without packaging it.

### Installing extensions

Settings → Extensions takes a **repository URL** — a link to a JSON index that
lists what a publisher offers. The app shows each extension's sources and the
domains it declares, then downloads and activates it on confirm. The two packs
built here are:

| Repository | Index URL | Sources |
|---|---|---|
| [nomanga-extension-mainpack](https://github.com/notreallyuri/nomanga-extension-mainpack) | `https://notreallyuri.github.io/nomanga-extension-mainpack/index.min.json` | WeebCentral, MangaDex, MangaPill, NatoManga, WEBTOON |
| [nomanga-extension-nsfw](https://github.com/notreallyuri/nomanga-extension-nsfw) | `https://notreallyuri.github.io/nomanga-extension-nsfw/index.min.json` | nHentai, Hitomi.la, MadaraDex, E-Hentai |

Adult sources living in a separate repository is deliberate: they are not
visible at all to anyone who has not added that second URL.

*Install from file…* remains for a `.wasm` you built yourself.

### Building an extension

Extensions live in their own repositories and depend on `nomanga-sdk` from this
one:

```toml
nomanga-sdk = { git = "https://github.com/notreallyuri/nomanga", branch = "main" }
```

`Cargo.lock` pins the resolved commit, so the SDK only moves on an explicit
`cargo update -p nomanga-sdk`. Each repo pins `wasm32-unknown-unknown` in
`.cargo/config.toml`, so a plain `cargo build --release` produces the `.wasm`.

The app loads `.wasm` files from its extensions directory (under the platform
app-data dir); `Registry::install` copies an extension in and activates it.

### Publishing a repository

A repository is a static directory: an index next to the `.wasm` files it
describes. Committing that directory and pointing GitHub Pages at it (*Settings
→ Pages → Deploy from a branch: main, folder /docs*) is enough — no CI is
involved.

The index is plain JSON and nothing stops you writing it by hand:

```json
{
  "index_version": 1,
  "name": "My pack",
  "description": "Optional.",
  "website": "https://github.com/you/my-pack",
  "extensions": [
    {
      "info": {
        "id": "dev.you.mypack", "name": "My Pack", "version": "0.1.0",
        "abi_version": 5, "author": "you", "website": null
      },
      "download_url": "my_pack.wasm",
      "sources": [
        {
          "id": "com.example.en", "name": "Example", "version": "1.0",
          "language": "en", "base_url": "https://example.org",
          "icon_url": null, "hosts": ["example.org"], "nsfw": false
        }
      ]
    }
  ]
}
```

`download_url` may be a bare file name, resolved against wherever the index was
fetched from, so the same directory works served from anywhere. Use an absolute
URL only when the `.wasm` lives elsewhere, such as a release asset.

Nothing in the index is trusted: the app re-reads the `.wasm` through
`ExtensionMetadata::inspect` on install, so a wrong `abi_version` or an invented
source is caught there. The index exists so the app can *show* a list before
downloading, not to vouch for it.

`nomanga-cli` is the ergonomic path rather than a requirement — it reads the
metadata out of the built binaries, so what you publish cannot drift from what
shipped, and writes a browsable landing page beside it:

```sh
nomanga-cli index --name "My pack" \
  --out docs/index.min.json --json --html docs/index.html docs/*.wasm
```

`index.html` is self-contained and derives the repository URL from `location`
at view time, so opening the Pages URL in a browser gives a copyable link, the
source list, and each extension's declared hosts. Its *Open in nomanga* button
is a `nomanga://add-repo?url=…` link — the app registers that scheme, focuses
itself, jumps to Settings → Extensions and asks the user to confirm the URL.
A link can only ever *add* a repository; installing is still a separate,
explicit step with its own host allow-list confirmation.

On Linux the handler comes from the `.desktop` file's
`MimeType=x-scheme-handler/nomanga`, so it is registered by the PKGBUILD or by
`packaging/install-local.sh`; a `pnpm tauri dev` build registers it at runtime
instead. Windows registers it from the NSIS installer, macOS from the bundle.

Grab a prebuilt binary from [Releases](https://github.com/notreallyuri/nomanga/releases)
(`nomanga-cli-linux`, `-macos`, `-windows.exe`), or build it with
`cargo install --git https://github.com/notreallyuri/nomanga nomanga-cli` — the
latter compiles wasmtime, so it takes a few minutes. Both extension repos carry
a `publish.sh` wrapping the whole build-and-write step.

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
see [nomanga-extension-mainpack](https://github.com/notreallyuri/nomanga-extension-mainpack)
for complete working sources.

## Tech stack

Rust (workspace, edition 2024) · [Extism](https://extism.org) (WASM host/PDK) ·
[Tauri v2](https://tauri.app) · React 19 + Vite + TypeScript ·
[sqlx](https://github.com/launchbadge/sqlx) + SQLite ·
[specta](https://github.com/specta-rs/specta) / tauri-specta ·
`scraper` for HTML parsing.
