# TODO

## Open

### Extension distribution

- [ ] Check for extension updates in the background, the way library updates
  already do, instead of only on a visit to Settings → Extensions. The catalog
  fetch and the version comparison both exist; what is missing is a schedule
  and somewhere to surface "3 extensions have updates".

### Cloudflare bypass

NatoManga no longer needs this — the source moved to `manganato.gg`, which
answers the app's own client ungated, so all its methods work without a bypass.
It is no longer the test target and nothing ships blocked. What remains open is
the general capability, for the next source that puts a managed challenge in
front of a page the app has to read.

- [ ] Finish the Cloudflare bypass. The harvesting path is **built**, end to
  end, and unproven against a real gate:
  - `Challenge { url, cookies }` is an optional field on `SourceInfo`
    (`packages/core/src/extension/source.rs`), additive at ABI 6 — an ABI 5
    extension emits none and reads as `None`, which is why `ABI_MIN_SUPPORTED`
    stayed at 5.
  - `solve_challenge` / `cancel_challenge`
    (`client/src-tauri/src/commands/challenge.rs`) open the declared page in a
    separate window, poll the webview cookie store, and copy every named cookie
    — Domain and Path carried over, not just `name=value` — into the shared
    `reqwest::cookie::Jar` the transport, image proxy and download worker all
    read. `challenge-dialog.tsx` drives it.
  - A separate window rather than an embedded one because on Linux wry packs a
    child webview into the window's GtkBox, which ignores its bounds and lays
    out as a sibling of the app.
  - The jar is in-memory, so a clearance does not survive a restart. Persisting
    it is the open question, and it is a credential — it wants the care the
    debug export's redaction got.
  - Still missing: a source that actually exercises it. Every installed source
    now answers ungated, so `solve_challenge` has been run against a real
    interstitial but never against one whose cleared cookie then had to carry a
    real fetch.

- **Cookie harvesting alone is not sufficient in the general case. Measured
  against NatoManga 2026-07-30, before the domain move; do not re-derive it.**
  A fresh `cf_clearance` from a real browser, replayed from the same machine and
  IP through the app's reqwest client, 403'd identically to sending no cookie at
  all. curl behaved the same. Not a UA problem — Firefox 128/140/143/145 and a
  current Chrome string all 403'd. Not a provenance problem either: the app's
  own challenge window solved a real interstitial and minted one, and that
  cookie replayed seconds later under WebKit's own UA 403'd too. Cloudflare was
  gating on the client's TLS/HTTP fingerprint, which is the one thing a cookie
  cannot carry.
  Two things worth keeping:
  - The challenge only renders and passes when the webview keeps its **native**
    user agent. Forcing core's `USER_AGENT` onto it made Cloudflare serve
    Gecko-targeted challenge code to a WebKit engine, which hung and painted the
    window black. `challenge.rs` deliberately does not pin the UA, and whatever
    is built next must let the engine be honest about what it is.
  - Gates are route-scoped. `/` was open to bare curl with no user agent while
    `/manga-list/*` and `/manga/*` were gated, and those routes answered a
    browser-shaped request with a real, solvable interstitial. Only the *export*
    to reqwest failed.
  So when the harvesting path meets a fingerprint-gated source, the fetch itself
  has to happen in a browser engine. Two options if that day comes: route the
  blocked fetches through the webview (Tauri v2 can grant remote URLs IPC
  access, so a page in the source's own origin can fetch and hand the HTML
  back), or swap the HTTP stack for one that reproduces a browser's TLS
  fingerprint.

### Browse

- [ ] Allow name-searching in all sources (does not include source-specific
  filters) — search-all bar stubbed in the browse landing; backend pending. The
  per-source opt-out is already stored: honour `source_preference.hide_from_search`
  when picking which sources the query fans out to.

### Updates

- [ ] Tray menu implementation.

### App self-update

Distinct from everything else filed under "Updates", which all means *library*
updates — checking sources for new chapters. This section is the app updating
itself. Worth keeping the words apart in UI copy too.

- [ ] Self-update on Windows and macOS via `tauri-plugin-updater`; on Linux,
  delegate to the package manager and ship no updater at all.
  The switch already exists and is wired to nothing: `update_on_startup` in
  `SystemSettings` appears exactly four times in the tree — the field, its
  default, the generated TS type, and the Switch in
  `settings/sections/system.tsx` — with no consumer in Rust or TS. Its label
  ("Check for app updates automatically when launched") already describes
  `check()` semantics, so it is the intended consumer, not something to redefine.
  Decided platform split, because the updater supports AppImage/tar.gz, `.app`
  and MSI/NSIS but **not** deb, rpm or anything pacman-shaped:
  - Windows + macOS get real in-place updates.
  - Linux delegates to pacman. Gate with `#[cfg(any(target_os = "windows",
    target_os = "macos"))]` rather than runtime detection, so the Linux binary
    does not contain the updater path at all; AppImage then drops out of the
    updater story entirely — no Linux artifact to generate, sign or list in the
    manifest.
  - Frontend needs one bit to decide whether to render the switch. A
    `self_update_supported() -> bool` command returning
    `cfg!(any(windows, macos))` is enough and avoids adding `plugin-os`.
  - Deliberately **no** update nagging on Linux. An app that reports updates it
    cannot install is the usual reason distro packagers patch updaters out, and
    the AUR helper already reports it. Showing the running version in Settings
    is enough.
  Prerequisite on the Linux side: "pacman handles it" is only true for a package
  pacman can see, and `packaging/arch/PKGBUILD` currently lives in this repo and
  nowhere else, so updating means re-running `makepkg -si` from a fresh clone.
  Needs a decision when published: `nomanga-git` tracks `main` and recompiles
  wasmtime on every commit and always looks newer than any tag, versus a
  `nomanga-bin` tracking release tags — friendlier, and cheap since CI already
  builds the binary (a plain tarball, or extracted from the `.deb`, which is the
  usual AUR pattern for Tauri apps).
  The plugin side is six pieces: the dependency, registration beside the others
  in `lib.rs`, `"updater:default"` in `capabilities/default.json`,
  `bundle.createUpdaterArtifacts: true`, a `tauri signer generate` keypair
  (pubkey in `plugins.updater.pubkey`, private half + password as GH secrets
  exported into the existing Build step), and an endpoint. The pubkey is
  compiled in, so the endpoint does not have to be trusted — a static
  `latest.json` on the release is fine.
  Four things `.github/workflows/build.yml` needs, none obvious:
  - The macOS updater artifact is `bundle/macos/*.app.tar.gz`, **not** the dmg.
    The workflow uploads only `dmg/*.dmg` today, so both the artifact globs and
    the `gh release upload` list need the tarball.
  - Every updatable artifact's `.sig` has to be uploaded too.
  - The macOS build is `--target universal-apple-darwin`, one binary, but the
    manifest still needs **both** `darwin-x86_64` and `darwin-aarch64` keys
    pointing at the same url/signature. Miss one and half of Mac users silently
    never see an update.
  - Assemble `latest.json` in a job that `needs` the matrix — each platform job
    only sees its own `.sig`, which is the same race `create-release` already
    exists to avoid. Note `releases/latest/download/` does not resolve while the
    release is a draft, so the current draft flow doubles as a staging gate.
  - Guard that the `v*` tag matches `tauri.conf.json`'s `version`. `check()`
    compares against that field, so tagging `v0.2.0` with the config left at
    `0.1.0` publishes a manifest nobody upgrades to — in a path that only runs
    when nobody is watching.
  Two things already in our favour: `bundle.windows.nsis.installMode` is
  `currentUser`, so a Windows update needs no elevation and the silent
  install-and-relaunch really is silent (per-machine would throw a UAC prompt
  into the middle of it); and macOS in-place update works without an Apple
  certificate, since the plugin enforces its own minisign check rather than
  Gatekeeper's — though users there are already past an unsigned-app prompt at
  install, so Windows is where this pays off most.
  Watch the version source of truth while the Arch package is git-based:
  `pkgver()` derives `0.1.0.rN.gHASH` for pacman only, and the app still reports
  `tauri.conf.json`'s `0.1.0`, so a build tracking `main` would be offered a
  released `0.1.1` as an "update" while running newer code. Moot once Linux
  carries no updater, but it is the reason the cfg gate is the mechanism rather
  than a runtime check that could be flipped on.
  Considered and dropped: a notify-only path (compare `tag_name` from the GitHub
  releases API, open the release page with `plugin-opener`, no keypair and no CI
  change) as a first step. It was attractive only because it also covers deb and
  pacman installs — and with Linux delegating to the package manager, that
  constituency is gone.

### Release & distribution

Versioning is settled as of 2026-07-30: every manifest reads `0.1.0`, and
`[workspace.package]` in the root `Cargo.toml` now carries `version`, `license`
and `repository` so a release is one edit. `core` and `sdk` keep their own
versions — they are the pair a third party would pin, and the rest are one
binary, so nothing resolves them by version. `pkgver()` derives from
`git describe` rather than a hardcoded string, so the Arch package tracks
releases on its own once a tag exists.

- [ ] Tag `v0.1.0`. Held deliberately: the app is early and UX polishing comes
  first. Note the tag *is* the release — `.github/workflows/build.yml` triggers
  on `v*`, cuts a draft GitHub release and runs the three-platform build, so
  pushing one is the moment this becomes publicly visible.

- [ ] Publish to crates.io, in order: `core` → `host` → `sdk`. Only `core` has
  to go first (the other two depend on it). Both `host` and `sdk` already carry
  `version = "0.1.0"` on their `nomanga-core` path dependency, which cargo
  requires before it will publish at all. `cli` still has `*` on its path deps,
  so it would need the same treatment if `cargo install nomanga-cli` ever
  becomes a goal.

- [ ] Move the client to its own repository, taking `nomanga-services` with it.
  The seam is reusable engine versus app: this repo keeps `core`, `sdk`, `host`
  and `cli`; the client repo gets `nomanga-client` + `nomanga-services`, both
  `publish = false`.
  Services stays off crates.io on purpose — its public API is really the app's
  SQLite schema, so it churns with every feature, and SemVer on that is a
  permanent tax for no external consumer. A split-out client can consume it by
  git tag, the same way `docs/writing-a-source.md` already tells extension
  authors to consume the SDK.
  This is also what makes publishing `host` worth doing rather than optional:
  the split client needs `core` and `host` from somewhere, and `cargo add` beats
  git-pinning your own engine.
  Travelling with services when it moves: the `.sqlx` offline cache, the
  migrations, and `SQLX_OFFLINE: true` in CI — nothing left here touches sqlx.
  The Tauri bundling, `packaging/arch/PKGBUILD`, `packaging/install-local.sh`
  and the `.desktop` file go too; the CLI build step stays.

### Downloads and updates

- [ ] Parallel chapter downloads, 1–4 at a time, configurable in System
  settings. Today `worker` in `client/src-tauri/src/downloads.rs` is a single
  `while let Some(job) = rx.recv()` loop, so a queued series downloads strictly
  one chapter at a time.
  Cheaper than it looks, because the two halves of a download are already
  separate: only the page list goes through the plugin (`fetch_page_list` →
  `handle.throttled(SourceMethod::Pages, …)`), while the images are fetched with
  the host's own `reqwest::Client` and touch neither wasm nor the rate limiter.
  The bookkeeping is already concurrency-shaped too — `queued`/`cancelled` are
  keyed `(source_id, manga_id, chapter_id)` rather than "the current job",
  `record_chapter` writes one independent row set per chapter, and
  `DownloadsProvider` keeps a per-chapter map and derives `active` as a count,
  so the queue dialog renders several `Downloading` rows with no UI change.
  Shape: `worker` becomes a dispatcher whose current body moves into a task in a
  `JoinSet`, awaiting `join_next()` while in-flight ≥ limit. Re-read the limit
  from `state.settings` each iteration rather than caching it — `save_settings`
  has no side-effect hooks, so that is what makes the setting apply without a
  restart (raising it takes the next dispatch, lowering it drains). Keep pause
  as "pauses between chapters" so it stays clear of the partial-file question.
  `SystemSettings` is `#[serde(default)]`, so the new field needs no migration.
  Three things to decide when building it:
  - Page-list fetches still serialise per source. `with_plugin` holds a mutex
    over the single wasm instance for the whole guest call, and *browsing shares
    it* — a running queue makes search and chapter-list calls queue behind it.
    Throughput is barely affected (one guest call per chapter vs. dozens of
    images); "downloads make browsing feel sluggish" is the failure mode.
  - Image requests are unthrottled — `SourceMethod` has no `Image` variant, and
    the only thing keeping them polite today is that a chapter fetches its pages
    one at a time. Concurrency N is the first time N simultaneous requests hit
    one CDN, which is what the MadaraDex-style shields react to. Reason to cap
    at 4 rather than exposing 8 or 16.
  - A global cap can hand all slots to one host when two sources are queued. A
    global N plus an implicit per-source max of 2 is politer and barely more
    code; easier to build in now than to retrofit.
  Minor: `db.rs` sets no journal mode and sqlx 0.9 deliberately leaves it alone,
  so the pool is on the default rollback journal — one writer at a time. Two
  chapters finishing together means one waits on the 5s busy timeout.
  Transactions are short enough not to bite at N=4; `.journal_mode(Wal)` is the
  answer if it ever does.
  Alternative axis, not chosen: parallelising *pages within* one chapter. Same
  request budget, but one chapter finishes 3× faster instead of three finishing
  at once — usually the better feel when downloading the next chapter to read
  now. Needs the cancel check at the page loop to move into the join. The two
  compete for the same politeness budget, so doing both later means bounding
  N×M.

### System

#### E. Developer section

Whole nav entry gated behind a `developer_mode` switch in System, invisible by
default.

- [ ] Debug server (optional follow-on to the in-app panels).
  - Loopback `127.0.0.1` listener only, off by default. This is the one piece of
    the topic with a real security surface.

## Done

### Extension distribution

- [x] Install extensions from a repository URL rather than a hand-downloaded
  `.wasm`. Settings → Extensions takes a link; the app fetches an index, lists
  what it offers, and installs, updates or reinstalls from there.
  `RepositoryIndex`/`RepositoryExtension` in core carry each extension's
  `ExtensionInfo`, a `download_url` and the full `SourceInfo` list — enough to
  render a browsable list and show the host allow-list before anything is
  downloaded.
  `download_url` may be **relative to the index**, which is what makes a
  repository publishable as a plain served directory: index and `.wasm` side by
  side, no absolute URL baked in at build time, no CI. This is the shape
  Aidoku's source lists use, and it is why `publish.sh` in each extension repo
  only has to write `docs/` for GitHub Pages. `nomanga-cli index` builds the
  index from the binaries' own metadata, so the published `abi_version` and
  source lists cannot drift from what shipped.
  Three consequences of the URL being user-pasted, all load-bearing:
  `install_from_repository` takes an extension *id*, not a download URL, so the
  app only ever fetches a binary a registered repository's own index points at;
  both fetches are size-bounded (4 MB index, 64 MB wasm) against a server that
  streams forever; and the index's `abi_version` is checked against
  `[ABI_MIN_SUPPORTED, ABI_VERSION]` before downloading, with
  `ExtensionMetadata::inspect` still authoritative on install — a repository
  that publishes a wrong ABI is caught either way.
  `browse_repositories` resolves the unsupported ids host-side so the frontend
  carries no second copy of the range, and reports per-repository failures in
  the row rather than as an error, so one dead link does not blank the list.
  Trust is handled the only way it can be: the sandbox and the declared
  allow-list contain the extension, and the allow-list is shown in a
  confirmation before the download rather than buried in source settings after.
  Adult sources staying in their own repository means they are invisible to
  anyone who has not added that second URL — no NSFW gate needed on the
  repository itself.
  Verified end to end over HTTP: `publish.sh` → served `docs/` → index fetched,
  relative `download_url` resolved, `.wasm` downloaded and loaded at ABI 5.
  Published live at `notreallyuri.github.io/nomanga-extension-mainpack`. Pages
  needed the GitHub Actions source, not "deploy from a branch": the latter runs
  Jekyll over `docs/` *even with a `.nojekyll` in it* and then dies converting
  the default theme's `style.scss`. `pages.yml` uploads the directory verbatim
  and compiles nothing.

- [x] `nomanga://add-repo?url=…` deep link, so the generated landing page can
  hand a repository straight to the app. `tauri-plugin-deep-link` registers the
  scheme; `DeepLinkProvider` parses the link, rejects anything that is not
  http(s) (the backend's `normalize_url` checks again), focuses the window,
  opens Settings → Extensions and raises a confirmation.
  The link *adds*, never installs — it is untrusted input from any page on the
  internet, so it can at most put a URL in front of the user, and installing
  stays a separate step behind the host allow-list dialog.
  On Linux this rides on `MimeType=x-scheme-handler/nomanga` in the `.desktop`
  file, so it comes from the PKGBUILD or `install-local.sh`; dev builds call
  `register_all()` at runtime since they have neither.
  Worth remembering: the page is one big `format!` raw string and
  `href="#"` contains `"#`, which closed `r#"…"#` early. It is `r##"…"##` now,
  with a test asserting the document still ends in `</html>`.

- [x] Source icons are `data:` URIs baked into the extension, not links to each
  site's favicon. The app renders `SourceInfo.icon_url` straight into an `<img>`,
  so every Browse and Sources render was one request per source to that site —
  announcing to each which extensions a user has installed, on a screen they
  open constantly.
  They live in the `.wasm` rather than the published index deliberately: an
  installed extension's `SourceInfo` comes from the binary, so index-only
  embedding would have fixed the pre-install list and left Browse still
  hotlinking. The index gets them anyway, since it is built from the binaries'
  own metadata.
  `nomanga-cli icon <url|file> --out <path>` normalises to a 64×64 PNG data URI
  (favicons are often `.ico`, MangaPill's was a 180px touch icon), and the
  source does `include_str!`. It accepts a local file because fetching is not
  always possible: two of nine were already broken in the app before this —
  WeebCentral 403s a plain fetch and NatoManga's favicon is behind Cloudflare —
  and MadaraDex 404s `/favicon.ico`, serving its logo from `wp-content`.
  Cost: +4% wasm, and the mainpack index went 1.6 KB → 43 KB. Worth watching if
  a repository ever carries many packs; the format still allows a relative
  `icons/` path the way Aidoku does.

- [x] Reinstalling an installed extension no longer lists it twice.
  `Registry::load_from` ended with `self.extensions.push(meta.extension)` on a
  `Vec<ExtensionInfo>` with no check for an existing id, so a second install
  appended a duplicate; a restart hid it because `scan` rebuilds from an empty
  `Vec` and `install` overwrites `{extension_id}.wasm` rather than adding a
  file. It now replaces the matching entry in place, and drops the sources the
  extension previously owned before inserting the new set — `push` could not do
  that, so a source removed by an update used to linger with a stale plugin.
  Activation moved ahead of every mutation of `self`, so a failure part-way
  through leaves the previous version loaded instead of half-removed.
  `packages/host/tests/reinstall.rs` covers it; it needs a real `.wasm`, so it
  takes one from `TEST_WASM` and skips when that is unset (no pack lives in this
  repo any more, and the smallest is ~1 MB).

### System

- [x] Request/response inspector (E1).
  (The open question is answered: extensions no longer reach the network at all.
  `HostRequest`/`HostResponse` in core are the wire types, `nomanga_fetch` is a
  custom Extism host function, and `nomanga_sdk::guest::send()` replaced
  `extism_pdk::http` — one function, since every extension funnels through
  `guest::Request`. ABI 3 → 4.
  `ExtensionMetadata::inspect` had to register the import too, via a
  `transport::denied()` stub: a module that imports `nomanga_fetch` will not
  instantiate without it, but metadata reads must never reach the network.
  `allowed_hosts` enforcement moved host-side with the transport, reproducing
  Extism's wildcard shape; unit-tested, including that `*.example.com` rejects
  `example.com.evil.com`. Losing that check was the one way this change could
  have quietly widened what an extension may reach.
  Sync→async bridge: the wasm call already runs on `spawn_blocking`, so blocking
  is safe but driving reqwest from it is not — requests cross a channel to a
  runtime task. The CLI has no runtime and uses `ureq` instead.
  `CallLog` is a 200-record ring with a 256 KB body cap behind a `recording`
  flag, off by default. UI lives in Developer → Network: toggle, clear, and a
  row per call expanding to source, timing, both header sets and the raw body.
  Verified live: recording off yields 0 records, on yields full URL, status,
  duration, byte counts, correct per-source attribution, request headers and
  raw HTML.
  Follow-ons this unblocks: the Cloudflare bypass now has its cookie-injection
  point, and the per-method rate limiter could move onto this transport.)

- [x] Debug export for issue reports.
  (Selected rows in the Database browser and the whole Network log export as
  JSON, so a user can attach them to a bug report for an extension developer.
  Redaction is not optional and happens host-side, because these files are
  written to be pasted into public issue trackers: credential-bearing headers
  (`Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, …) become `<redacted>`,
  and `source_setting.value` is redacted when the key looks secret. Both are
  real risks, not hypothetical — `guest::Request::bearer()` sets an
  Authorization header, MangaDex declares a secret `session_token`, and a live
  install had a 52-character `api_key` sitting in `source_setting`.
  `User-Agent` and `Referer` deliberately survive: they are usually the thing
  being debugged. Each export carries a `note` field saying what was removed, so
  the recipient knows a header was stripped rather than absent.)

- [x] Developer section (E2) — state and database inspector.
  (Gated behind a `developer_mode` switch in System; the nav entry is filtered
  out of the settings sidebar entirely when off. `debug_state()` reports app and
  ABI version, device name, resolved paths with an exists flag, installed
  extensions with an ABI-mismatch marker, cover-cache stats, and per-table row
  counts. `debug_table(name, page)` pages 50 rows at a time.
  Deliberately no arbitrary SQL: `TABLES` is a fixed list, and `table_page`
  resolves the caller's string against it and interpolates the resulting
  `&'static str`, so a caller-controlled string never reaches the query. sqlx
  0.9 rejects dynamic SQL outright — `AssertSqlSafe` is the audited opt-in.
  Values are stringified via the raw column type since SQLite is dynamically
  typed, with NULL rendered distinctly from empty text.)

- [x] Sync library and settings between systems via a shared folder.
  (Push writes `nomanga-<device>-<ts>.backup` into the chosen folder and updates
  a `latest.json` manifest; Pull reads the manifest, imports as Replace, and
  offers a restart. Keeps the 5 most recent snapshots per device so a bad push
  can be recovered from without growing without bound.
  Correction to the original plan: the plan put `sync_folder` and `device_id` on
  `Settings`, but `import_backup` applies `restored.settings` wholesale — those
  fields would have travelled inside the backup and overwritten the receiving
  device's identity, breaking the very conflict detection they exist for. Sync
  state lives in its own `sync.json` beside settings.json, and is never
  exported.
  Conflict detection is a warning, never a merge: `local_activity_at()` takes
  the max over library_entry.added_at, read_progress.updated_at and
  read_chapter.read_at, and the UI warns when that is newer than the snapshot
  about to be pulled. Chosen over a live DB in a cloud folder because cloud
  clients do not respect SQLite locking and two open apps corrupt the file.
  Verified end to end with the real library: 51 entries / 6 categories /
  51 memberships moved between two databases exactly.
  Push/pull command hooks (`post_push_command`, `pre_pull_command` in
  sync.json) carry the folder to remotes the filesystem cannot reach — Proton
  Drive's CLI is upload/download only, not a mount, so a plain folder path
  cannot address it. Placeholders `{folder}`, `{folder_name}` and
  `{folder_parent}`; the latter two exist because these tools take the *parent*
  as the destination when transferring a directory. Ordering is load-bearing:
  the upload runs last and `last_push_at` is only set once it succeeds, so a
  snapshot that never reached the remote is never counted as pushed; the
  download runs first and aborts before Replace touches the database. 5-minute
  timeout, stderr surfaced in the error. Presets in the UI for Proton Drive,
  rclone, rsync-over-SSH, and desktop sync clients (which need no command —
  they point the folder at the synced directory instead). The staging folder
  defaults to `<data dir>/sync`, so hook users never have to choose one; it is
  only worth changing when the folder itself is the shared medium.
  Verified against a real Proton Drive account: push and pull round-tripped
  51 entries / 6 categories with the library intact afterwards.
  These hooks must stay out of `Settings` for the same reason device identity
  does — settings travel inside a backup, so a command string there would let
  any imported backup run arbitrary commands on the importing machine.)

- [x] Backup and Restore under System settings.
  (`services/src/backup.rs` — one gzipped JSON doc with a `version` field so a
  future schema change migrates on read rather than rejecting. Carries settings,
  library entries, categories + membership, history, source preferences/settings
  and reader overrides, plus installed extension ids/versions for reporting.
  Leaves out downloads and the image cache.
  Correction to the original plan: `library_entry` has an FK onto `manga` with
  ON DELETE CASCADE, so `manga` is not purely a derived cache — the rows backing
  a library entry are structural and must ship in the backup or restore fails on
  the FK and loses every title and cover. Only those rows are included, not the
  whole manga cache.
  Merge upserts by natural key, reuses categories by name with an id remap, and
  will not rewind reading progress the local device has taken further — the
  conflict rule is `WHERE excluded.updated_at > read_progress.updated_at`.
  A local default category always survives a merge, since only one row may carry
  `is_default`. Replace clears the library graph transactionally first.
  Restore rewrites settings.json, applies to the live lock, and offers
  "Restart now" — the registry and background loop hold state a restore
  invalidates, and a restart is one line against a long tail of stale-state bugs.
  Verified against the real library: 51 entries / 6 categories → 15.8 KB.)

- [x] Image cache for covers, with a size limit and a clear action.
  (Cached at `app_cache_dir()/images/<2-hex>/<sha256(url)>` — outside the data
  dir, so it stays out of D's migration and C's snapshots. `srcimg://` is the
  chokepoint, but reader pages flow through it too, so caching is opt-in per
  call site: `sourceImageUrl(id, url, { cache: true })` appends `&cache=1` and
  only the two cover call sites set it. A hit streams from disk; a miss responds
  first and writes + evicts in a spawned task, so first paint never waits on
  disk. Eviction is LRU by `accessed_at` down to 90% of the limit; a row whose
  file vanished counts as a miss and is dropped, which is the whole orphan
  story. `ImageCacheLimit` mirrors `UpdateInterval` so the existing Select
  works unchanged, with `Off` doubling as the disable switch.)
  - Note: the proxy already sends `Cache-Control: public, max-age=86400`, so the
    webview serves many repeats without reaching the handler. The win this buys
    is *across restarts*, not within a session.

### Platform

- [x] Downloaded pages are named after what the bytes are, not what the URL
  claimed. `pick_extension` read the URL extension first and only fell back to
  `Content-Type`; WeebCentral serves JPEG bytes from `.png` URLs, which misnamed
  7465 of one library's 7874 "PNG" pages — 1.82 GB, 65% of that store. Nothing
  broke visibly, because webviews sniff image content and ignore the extension,
  which is also why the fix is forward-only: existing files render fine and
  renaming them would rewrite user data to correct a hint nothing reads.

- [x] Considered and dropped: recompressing downloads to save space. Measured
  against a real 2.8 GB library on 2026-08-01, so it does not need re-deriving.
  Pages already arrive at ~0.16 bytes/pixel, and re-encoding already-lossy JPEG
  buys almost nothing:
  - lossless WebP: **2.5x larger**
  - WebP q90: 17% larger; q85: 1.6% smaller
  - AVIF q80: 11.5% smaller; q70: 25% smaller, visibly lossy
  - jpegtran `-optimize -progressive`: 8.3% smaller, pixel-identical — the only
    genuinely lossless option, and not worth a mozjpeg dependency plus a pass
    over thousands of files.
  If download size becomes a problem, retention (dropping read chapters) is the
  lever, not the encoder.

- [x] Referer-gated image CDNs:
  - Affects two sources already: NatoManga (covers *and* pages) and WEBTOON
    (page images only — its covers are open). Both 403 without
    `Referer: <source base_url>`. The download worker already sent it, but the
    online reader rendered `<img src={page.image_url}>` from the webview, which
    sends the app origin instead. `referrerPolicy` can't forge a cross-origin
    referer, so the fetch had to move into the backend.
  - Done: a `srcimg://` URI scheme (`client/src-tauri/src/image_proxy.rs`)
    fetches the image host-side with the source's `base_url` as Referer and
    streams it back. `sourceImageUrl()` in `client/src/lib/source-image.ts`
    wraps a URL for it; applied to reader pages (once at the route, so the
    paged reader's preloading is covered too) and to covers via `MangaCard`
    plus the manga detail hero. Non-http URLs — downloaded chapters served over
    the asset protocol — pass through untouched, and the proxy is a
    pass-through for CDNs that don't check.
- [x] Source-based custom rate-limit:
  - So the application may properly follow the source's rate-limiting.
  - (No rate-limit is applied by default, but the developer may set one for the
    source per command.)
  - Done: `Source::rate_limits()` declares per-method limits (Homepage, Search,
    Section, Manga, Chapters, Pages); host enforces them with a per-method token
    bucket that delays (never drops) calls. ABI bumped to 2.
    (ABI 3: `SearchQuery.query` renamed to `SearchQuery.term`.)

### Library

- [x] Skip updates per category, alongside the existing per-source switch.
  A `skip_updates` column on `category`, surfaced as a toggle in the category
  options popover and a marker on the row beside default/hidden/locked.
  Two rules, both deliberate and both tested:
  - **All, not any.** An entry is muted only when *every* category it belongs to
    is marked to skip. A series filed in both "Finished" and "Reading" is still
    being read, and letting one archived shelf mute it wherever else it appears
    would make the flag act at a distance — the failure would show up as
    chapters silently never arriving, which is the hardest kind to notice. An
    entry in no category is never muted; there is nothing to have said so.
  - **Naming the target overrides it.** The skip applies to `RefreshScope::All`
    only. Refreshing a specific category or a specific entry is the user
    pointing at something, and refusing to check it would read as a broken
    button. This differs from the per-source `skip_updates`, which applies to
    every scope — worth reconciling one day, but changing source behaviour was
    out of scope here.
  Travels in backups: `CategoryRow` carries the column, and the field is
  `#[serde(default)]` so a backup written before this still imports.
- [x] Cancel a library update run, from the updates dialog. Stop replaces
  "Check for updates" while a run is in flight, and the summary reports the run
  as partial rather than as a success or a failure.
  Cheaper than the download case was, structurally: a series is committed by
  `sync_chapters` only once its whole chapter list is back, so a series boundary
  is already a safe place to stop — nothing is half-written and there is no
  cleanup decision, unlike a download, which owns files. Series never reached
  keep their old `last_checked_at`, so the next run picks them up.
  An `AtomicBool` on `AppState`, shared with the background loop deliberately:
  to the user there is one "checking for updates" in progress, and Stop should
  end whichever run is behind it.
  Two things that are load-bearing rather than incidental:
  - The flag is cleared when a run *starts*, not when it ends. A Stop pressed
    just after a run finished would otherwise sit raised and kill the next run
    before it checked anything.
  - A cancelled run still emits the terminal `done == total` progress event.
    Listeners clear their progress on that event, so without it the UI sits on a
    bar that never completes. What happened rides on the summary, not the counts.
  Pause was considered and left out — a refresh is short, and the value of pause
  in downloads was avoiding a partial file, which has no analogue here.

- [x] Pause and cancel in the downloads queue dialog.
  Pause is a `watch::channel(bool)` the worker waits on **between chapters**, so
  the one already running finishes — that keeps pause clear of the partial-file
  question, and the UI says "Paused after this chapter" rather than implying an
  instant stop.
  Cancel covers both scopes through one `cancelled: HashSet<Key>`: the queue is
  an unbounded channel and a job cannot be pulled out of the middle of it, so
  the worker checks the set when the job surfaces, and `process` checks it
  between pages to stop one already downloading.
  The partial directory is **deleted**, reusing the existing failure path.
  `record_chapter` only runs once the whole chapter lands, so nothing is in the
  database and only files need clearing — a half chapter left on disk would read
  as a complete download, which is the one outcome worth avoiding.
  `DownloadState::Cancelled` is distinct from `Failed` so it carries no error
  and the row offers Retry. `groupState` only reports a series cancelled when
  *every* chapter is, so one cancelled chapter among downloaded ones still reads
  as finished.

- [x] Listing layout (Allow user to toggle the layout in the library)
- [x] Badge Toggle
- [x] Quick filters
- [x] Chapter selection + read-state actions in the manga details route
  (Shift-click range select, plus "Select all above" / "Select all below" /
  "Select up to here" in the row menu — all measured against the rows as
  displayed, so they respect the current sort and filter and span pages.
  The bulk read action is now a single button inferred from the topmost
  selected chapter: read → "Mark unread", unread → "Mark read".)
- [x] Downloads
  (Per-chapter + bulk download to disk, delete, and offline reading via the
  asset protocol. A background queue worker fetches pages over reqwest and
  streams DownloadProgress events to a persistent sidebar indicator + queue
  dialog. Chapter table shows per-row download/delete state.)

### Updates

- [x] Move Update visualization to the bottom of the sidebar.
- [x] Add a better updates visualization on the bottom of the sidebar,
  allowing users to see anywhere in the app the current state.
  (Persistent sidebar indicator + detailed progress dialog with a per-series
  live log; plus a "Clear" action that dismisses the current updates without
  marking them read.)
- [x] Add support for background updates (configurable interval in System
  settings, off by default; desktop notification on new chapters).

### UI

- [x] Fix overflow-x in manga update dialog
- [x] Refine `source-specific` settings components
  (Unified per-source detail view: app-policy toggles + extension-declared
  settings in one screen; simplified source list.)
- [x] Refine `_app/browse.tsx` route
  (Wired up "View more" paginated section view; reworked the browse landing
  with a nicer source grid + a search-all placeholder; extracted a shared
  BrowseCard.)
- [x] Make visual improvements on the Appearance settings
  (Mode / Colour / Cover style are now visual preview grids.)
