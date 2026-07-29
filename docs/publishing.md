# Publishing a repository

A repository is a **static directory**: an index next to the `.wasm` files it
describes. There is no registry, no CI and no release process required — commit
the directory and serve it.

## The short version

Both extension repos carry a `publish.sh` doing all of this:

```sh
cargo build --release
mkdir -p docs && cp target/wasm32-unknown-unknown/release/*.wasm docs/

nomanga-cli index --name "My pack" \
  --description "What it is." \
  --website "https://github.com/you/my-pack" \
  --out docs/index.min.json --json \
  --html docs/index.html \
  docs/*.wasm
```

Commit `docs/`, push, and point GitHub Pages at it. Users add
`https://you.github.io/my-pack/index.min.json`.

## Getting the CLI

Grab a prebuilt binary from
[Releases](https://github.com/notreallyuri/nomanga/releases) (`nomanga-cli-linux`,
`-macos`, `-windows.exe`), or build it:

```sh
cargo install --git https://github.com/notreallyuri/nomanga nomanga-cli
```

The latter compiles wasmtime, so it takes a few minutes — the prebuilt binary
exists to avoid exactly that.

## Hosting on GitHub Pages

Use **Settings → Pages → Source: GitHub Actions**, with this workflow:

```yaml
name: Pages
on:
  push:
    branches: [main]
    paths: ["docs/**"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs
      - id: deployment
        uses: actions/deploy-pages@v4
```

It compiles nothing — it uploads `docs/` and deploys. Nothing is built in CI.

**Do not use "Deploy from a branch."** That path runs Jekyll over `docs/` *even
with a `.nojekyll` in it*, then fails converting the default theme's stylesheet.
The workflow above sidesteps Jekyll entirely.

`raw.githubusercontent.com/<you>/<repo>/main/docs/index.min.json` also works with
no setup at all, if you would rather not touch repository settings. It is
rate-limited and not meant as a CDN, so Pages is better once you are past testing.

## The index format

Plain JSON — nothing stops you writing it by hand:

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
      "download_url": "extension_mypack.wasm",
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

`download_url` may be a **bare file name**, resolved against wherever the index was
fetched from. That is what lets the same directory work served from anywhere with
no absolute URL baked in at build time. Use an absolute URL only when the `.wasm`
lives elsewhere, such as a release asset — `--base-url` does that.

Nothing in the index is trusted: the app re-reads the `.wasm` through
`ExtensionMetadata::inspect` on install, so a wrong `abi_version` or an invented
source is caught there. The index exists so the app can *show* a list before
downloading, not to vouch for it.

`nomanga-cli index` is therefore convenience rather than a requirement — but it
reads the metadata out of the built binaries, so what you publish cannot drift
from what shipped.

## The landing page

`--html` writes a self-contained page beside the index. It derives the repository
URL from `location` at view time, so it is correct wherever it is served from and
never needs to be told its own hostname. It lists each extension's sources and
declared hosts, and carries an **Open in nomanga** button — a
`nomanga://add-repo?url=…` link that hands the URL to the app for confirmation.

## Source icons

`SourceInfo.icon_url` is rendered directly by the app, so a link to the site's
favicon means a request to that site on every Browse and Sources screen — telling
it which extensions the user has installed. Bake icons in instead:

```sh
nomanga-cli icon https://example.org/favicon.ico --out icons/example.txt
```

```rust
icon_url: Some(include_str!("../../../icons/example.txt").into()),
```

It normalises to a 64×64 PNG data URI, and accepts a local file — several real
sources need one, because a favicon behind Cloudflare cannot be fetched at all and
some sites serve their real logo from somewhere other than `/favicon.ico`.

Keeping icons in the `.wasm` rather than only in the index means *installed*
extensions get them too, and the index picks them up anyway since it is built from
the binaries' own metadata.

## Releasing a new version

Bump `version` in `Cargo.toml` — `register_sources!` reads it via
`env!("CARGO_PKG_VERSION")`, so that is the whole release. Rerun `publish.sh`,
commit, push. Users see **Update to X** on the installed extension's card after
*Check for updates*.

## Cost to be aware of

Embedded icons and the sources array make the index bigger than it looks — around
43 KB for a five-source pack. Fine for a pack or two; if a repository ever carries
many, the format still permits a relative `icons/` path served beside the index
instead.
