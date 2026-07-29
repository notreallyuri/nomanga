# Writing a source

A **source** is one site. An **extension** is one `.wasm` bundling one or more
sources. This walks through building one from nothing.

You will need the `wasm32-unknown-unknown` target:

```sh
rustup target add wasm32-unknown-unknown
```

## 1. Create the crate

```sh
cargo new --lib my-pack
cd my-pack
```

`Cargo.toml`:

```toml
[package]
name = "extension_mypack"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
nomanga-sdk = { git = "https://github.com/notreallyuri/nomanga", branch = "main" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Without this the wasm is several times larger.
[profile.release]
lto = true
opt-level = "z"
strip = true
```

`crate-type = ["cdylib"]` is what produces a `.wasm` rather than an rlib.

`Cargo.lock` pins the resolved SDK commit, so it only moves when you ask:
`cargo update -p nomanga-sdk`.

Pin the target so you never have to pass `--target`, in `.cargo/config.toml`:

```toml
[build]
target = "wasm32-unknown-unknown"
```

## 2. Implement `Source`

The trait lives in `nomanga_sdk::extension::source`. Only `info`, `homepage`,
`search`, `manga`, `chapters` and `pages` are required; the rest have defaults.

Start with `info` — this is the source's identity and, crucially, its network
allow-list:

```rust
use nomanga_sdk::prelude::*;
use nomanga_sdk::{guest, parse};

const DOMAIN: &str = "https://example.org";

pub struct ExampleSource;

impl Source for ExampleSource {
    fn info(&self) -> SourceInfo {
        SourceInfo {
            id: "com.example.en".into(),   // reverse-DNS, stable forever
            name: "Example".into(),
            version: "1.0".into(),
            language: "en".into(),
            base_url: DOMAIN.into(),
            icon_url: None,               // see "Icons" below
            nsfw: false,
            hosts: vec![
                "example.org".into(),
                "*.example.org".into(),   // image CDNs usually need this
            ],
        }
    }
}
```

`id` is the primary key for everything the user saves — library entries, read
progress, downloads all reference it. **Changing it orphans their data**, so pick
it once. `hosts` is enforced by the host: a request to anything not listed fails,
so include every CDN the site's images come from.

## 3. Fetch and parse

All network access goes through `guest`. Nothing else can reach out.

```rust
// Simple cases
let html = guest::get_text(&format!("{DOMAIN}/browse"))?;
let data: MyApiType = guest::get_json(&format!("{DOMAIN}/api/list"))?;

// When you need headers, a body, or a POST
let body = guest::Request::post(format!("{DOMAIN}/api/search"))
    .header("Content-Type", "application/json")
    .referer(DOMAIN)
    .json_body(&payload)?
    .text()?;
```

`parse` wraps `scraper` with helpers that return `SourceResult`, so `?` works:

```rust
use nomanga_sdk::parse::{attr, document, select_one, text, text_opt};

let doc = document(&html);
let root = doc.root_element();

let title = text(root, "h1.title")?;                    // errors if missing
let synopsis = text_opt(root, "div.summary");           // Option<String>
let cover = attr(root, "img.cover", "src")?;
let card = select_one(root, "div.card")?;               // ElementRef
```

Also there: `encode_query`, `encode_path`, `last_path_segment`, and
`select_containing` for "the row whose label says X".

## 4. Return the model types

| Method | Returns | Notes |
|---|---|---|
| `homepage` | `Homepage` | Named sections of `MangaSimple`, each with an id you get back in `section()` for "View more" |
| `search` | `MangaPage` | `{ items, has_next }` — `has_next` drives the pager |
| `section` | `MangaPage` | Optional; paginates one homepage section |
| `manga` | `Manga` | `id`, `title`, `description`, `tags`, `cover_url`, `author`, `artist`, `status`, `last_updated`, optional `rating`/`views` |
| `chapters` | `Vec<Chapter>` | `number` is `f32`, so `10.5` works; `volume`, `scanlator`, `page_count` optional |
| `pages` | `Vec<Page>` | `{ number, image_url }`, ordered |

`manga_id` and `chapter_id` are yours to define — whatever you need to rebuild a
URL. A slug is usually better than a numeric id, since it survives the site
redesigning its routes.

## 5. Register the extension

In `src/lib.rs`:

```rust
use nomanga_sdk::extension::info::ExtensionInfo;
use nomanga_sdk::extension::prelude::ABI_VERSION;

mod sources;

nomanga_sdk::register_sources! {
    extension: ExtensionInfo {
        id: "dev.you.mypack".into(),
        name: "My Pack".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        abi_version: ABI_VERSION,
        author: "you".into(),
        website: None,
    },
    sources: [sources::example::ExampleSource],
}
```

The macro generates every plugin export. Taking `version` from
`env!("CARGO_PKG_VERSION")` means bumping `Cargo.toml` is all a release needs —
the published index reads this back out of the built binary.

## 6. Build and test it

```sh
cargo build --release
# → target/wasm32-unknown-unknown/release/extension_mypack.wasm
```

Exercise it without launching the app:

```sh
W=target/wasm32-unknown-unknown/release/extension_mypack.wasm
nomanga-cli --wasm $W info
nomanga-cli --wasm $W --source com.example.en homepage
nomanga-cli --wasm $W --source com.example.en search "spy family"
nomanga-cli --wasm $W --source com.example.en manga <manga_id>
nomanga-cli --wasm $W --source com.example.en chapters <manga_id>
nomanga-cli --wasm $W --source com.example.en pages <manga_id> <chapter_id>
```

This is the fast loop — it needs no app, no database and no install. See the
[CLI reference](cli.md).

When it works, install it through **Settings → Extensions → Install from file…**,
or [publish a repository](publishing.md).

## Optional: filters

Declared with builders; the user's picks come back in `SearchQuery.filters`, read
by id:

```rust
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
    let mut url = format!("{DOMAIN}/search?q={}", parse::encode_query(&query.term));

    if let Some((sort, _)) = filters.sort("sort") {
        url.push_str(&format!("&sort={sort}"));
    }
    for status in filters.included("status") {
        url.push_str(&format!("&status={status}"));
    }
    // filters.excluded("tags") for the negative side of a tri-state
    // …
}
```

## Optional: settings

For API keys, preferred language, content ratings. Declared with `Setting::*`,
read back through `guest`:

```rust
fn settings(&self) -> Vec<Setting> {
    vec![
        Setting::select(
            "lang",
            "Language",
            SelectOption::list([("en", "English"), ("pt-br", "Português (Brasil)")]),
        )
        .with_description("Chapters and titles prefer this language."),
        Setting::toggle("data_saver", "Data saver", false),
        Setting::number("chapter_limit", "Chapters per request", 500),
        Setting::secret("api_key", "API key"),
    ]
}
```

Defaults are constructor arguments (`toggle`, `number`), not chained — the only
chainable is `.with_description()`. A `select` has no default, so read it with
`setting_or` and supply the fallback there.

```rust
let lang = guest::setting_or("lang", "en");
let saver = guest::setting_bool("data_saver", false);
let key = guest::setting("api_key");            // Option<String>
let ratings = guest::setting_list("ratings");   // multi-select
```

Use `Setting::secret` for anything credential-shaped. The debug export redacts
values whose key looks secret, and that redaction is what makes those files safe to
paste into a public issue tracker.

## Optional: rate limits

```rust
fn rate_limits(&self) -> Vec<RateLimit> {
    vec![
        RateLimit::per_second(SourceMethod::Homepage, 2),
        RateLimit::per_minute(SourceMethod::Pages, 20),
    ]
}
```

The host delays rather than drops. Note this throttles **calls to the method**, not
requests made inside one — a `pages()` that loops over 40 images internally is one
call, and the loop is unthrottled.

## Icons

`icon_url` is rendered directly by the app, so a link to the site's favicon means a
request to that site on every Browse and Sources screen. Bake it in instead:

```sh
nomanga-cli icon https://example.org/favicon.ico --out icons/example.txt
```

```rust
icon_url: Some(include_str!("../../../icons/example.txt").into()),
```

The command normalises to a 64×64 PNG data URI and accepts a local file, which
several real sources need — a favicon behind Cloudflare cannot be fetched at all,
and some sites serve their real logo from somewhere other than `/favicon.ico`.

## Things that will bite you

- **Hotlink-protected images.** Many CDNs 403 without a `Referer`. The app's image
  proxy sends the source's `base_url` automatically, so returning the plain URL is
  usually right — but if the CDN wants something else, set it during `pages()`.
- **Cookie-shielded CDNs.** `guest::set_cookie()` writes into the jar the app's
  image proxy and download worker share, so a token minted inside `pages()` is
  still there when the images are fetched.
- **Cloudflare.** A challenge cannot be solved from inside the sandbox. Sources
  behind one work only for endpoints that answer unauthenticated.
- **Test against saved HTML.** Sites change. Keeping fixtures and unit-testing the
  parsers means a break is a failing test rather than a mystery in the app.

## A complete example

[nomanga-extension-mainpack](https://github.com/notreallyuri/nomanga-extension-mainpack)
has five working sources covering the range: a JSON API (MangaDex), plain scraping
(MangaPill), cursor-only pagination, and a site needing a fingerprint handshake
before its CDN will serve images (MadaraDex, in the nsfw pack).
