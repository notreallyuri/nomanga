# Architecture

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
the network hosts it declares.

Identity everywhere is the `(source_id, manga_id)` pair — the same natural key the
ABI and the database use, so source calls and database rows line up with no
translation layer.

## Crates

| Crate / dir | Name | Role |
|---|---|---|
| `packages/core` | `nomanga-core` | Shared data model (`Manga`, `Chapter`, `Page`, `Homepage`) and the extension ABI types (`SourceInfo`, filters, settings, query refs, the repository index). The `typescript` feature derives specta types. |
| `packages/host` | `nomanga-host` | Extism host. `ExtensionMetadata::inspect`/`activate`, `LoadedExtension`, and a `Registry` that scans a directory of `.wasm` files and exposes sources by id. Owns the network transport and rate limiting. |
| `packages/sdk` | `nomanga-sdk` | Guest-side SDK for writing sources — see [Writing a source](writing-a-source.md). |
| `packages/services` | `nomanga-services` | SQLite persistence via `sqlx`: library, categories, read history & resume progress, downloads, per-source preferences, reader overrides, repositories, backup/sync. Ships migrations. |
| `cli` | `nomanga-cli` | Inspect and run an extension `.wasm` without the app, and build a repository index. See the [CLI reference](cli.md). |
| `client` | Tauri app | React/Vite frontend and the `src-tauri` backend wiring services + host into `#[tauri::command]`s. |

## The extension ABI

`packages/core/src/extension/source.rs` carries two constants:

```rust
pub const ABI_VERSION: u32 = 5;
pub const ABI_MIN_SUPPORTED: u32 = 5;
```

`ABI_VERSION` is bumped on **any** change to the guest-facing surface: exported
functions, host functions the guest imports, or the shape of types crossing the
boundary. `ABI_MIN_SUPPORTED` is raised only when a change *breaks* extensions
built against the older ABI — the host accepts anything in
`[ABI_MIN_SUPPORTED, ABI_VERSION]` and reports which side is out of date.

Adding a struct field is additive only if it carries `#[serde(default)]`. Without
that, deserialising an older extension's payload fails and the change is breaking.

## The network boundary

Extensions do not reach the network themselves. `nomanga_fetch` is a custom Extism
host function; `nomanga_sdk::guest::send()` is the only way out. Everything funnels
through it, which is what makes these possible in one place:

- **Host allow-list enforcement.** Wildcards reproduce Extism's shape, so
  `*.example.com` rejects `example.com.evil.com`.
- **Rate limiting.** `Source::rate_limits()` declares per-method limits and the
  host enforces them with a token bucket that delays rather than drops. Note it
  throttles *calls to the method*, not requests made inside one.
- **A shared cookie jar** across the transport, the image proxy and the download
  worker, so a source that authenticates a CDN inside `pages()` still has the
  cookie when the app fetches the image later.
- **The request log** behind Developer → Network, off by default.

`ExtensionMetadata::inspect` registers a `transport::denied()` stub for the same
import: a module that imports `nomanga_fetch` will not instantiate without it, but
reading metadata must never reach the network.

## Data & persistence

SQLite via `sqlx`, with compile-time-checked queries:

- **manga** — cached metadata, populated on any fetch (library or not)
- **library_entry** / **category** / **library_entry_category** — saved series and
  the shelves they belong to (a many-to-many join)
- **category options** — per shelf: private, default, sort mode, accent colour,
  icon, and an optional password lock
- **read_chapter** — per-chapter read state, a real table so "is X read?" is a query
- **read_progress** — last chapter/page per manga, powering *Continue reading*
- **reader_override** — per-source and per-manga reader settings layered over the
  global defaults
- **source_preference** / **source_setting** — enable/hide, blur covers, skip
  updates, plus each source's own declared settings
- **extension_repository** — repositories the user added

Rust command signatures and types export to `client/src/types/bindings.ts`
automatically on every debug build, so the frontend stays type-safe against the
backend. `client/src-tauri/tests/export_bindings.rs` regenerates them without
booting the app.

### The sqlx cache

Queries are checked at compile time, so building without a database relies on the
committed cache in `packages/services/.sqlx`. After changing any `sqlx::query*!`
macro:

```sh
cd packages/services
cargo sqlx prepare -- --all-targets   # needs DATABASE_URL (see .env.example)
```

`--all-targets` is what includes queries that only appear in tests. Without it the
app still builds but `SQLX_OFFLINE=true cargo test` fails on the missing entries.
Commit the resulting `.sqlx` changes — CI has no database and sets
`SQLX_OFFLINE=true`.
