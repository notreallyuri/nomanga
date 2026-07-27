# TODO

## Open

### Extensions

- [ ] Comix (`com.comix.en`)
- [ ] AsuraScans (`asuracomic.net`) — not started. Behind Cloudflare but
  passing as of 2026-07-26, so its selectors can be verified against live
  HTML rather than saved fixtures. Manhwa-heavy.
- [ ] Hitomi — not started.
- [ ] MadaraDex — not started.

### Cloudflare bypass

- [ ] Add a simple Cloudflare bypass:
  - Invokes another window, user passes the Cloudflare challenge.
  - Returns, the app grabs the Cloudflare key.
  - Test target: the NatoManga source (`com.natomanga.en`). The challenge is
    route-scoped, not site-wide, but the opening is narrow: only
    `/api/manga/<slug>/chapters` answers unauthenticated. Everything that
    renders a page 403s with `cf-mitigated: challenge`, including the search
    box's own AJAX endpoint `/home/search/json`. Other `/api/manga/*` paths
    reach the origin but 404 — there is no listing/search/details API to use
    instead, so the bypass is genuinely required for those.
  - So `chapters()` already works end to end live (verified: 66 chapters back
    to chapter 1, paging past the 50-row cap the detail page imposes), and
    homepage/search/manga/pages are the methods actually blocked. Their
    parsers are covered by fixture tests in
    `extensions/extension_mainpack/fixtures/natomanga/`; the one field those
    fixtures cannot prove is the detail-page cover, read from the JSON-LD blob
    because "save page as" rewrote the real `src`.

### Library

- [ ] Update Behavior customization

### Browse

- [ ] Allow name-searching in all sources (does not include source-specific
  filters) — search-all bar stubbed in the browse landing; backend pending.

### Updates

- [ ] Tray menu implementation.

### System

A, B and C are done; **D was dropped**; E is what remains.

D (a relocatable data directory) was only ever the *mechanism* for the sync goal
the original TODO line described — "move the database/settings outside the app
**and sync between multiple systems**". C delivers that goal without moving
anything, so relocation buys nothing and costs the riskiest change in the topic:
closing the pool mid-session, copying a live database, a pointer file outside the
data dir, and a static `assetProtocol` scope that no longer covers downloads.
The data stays where the rest of the configuration lives. Not revisiting unless
a concrete need appears that C cannot serve.

E1 is last because of an open unknown (see below).

#### E. Developer section

Whole nav entry gated behind a `developer_mode` switch in System, invisible by
default.

- [ ] Debug server (optional follow-on to the in-app panels).
  - Loopback `127.0.0.1` listener only, off by default. This is the one piece of
    the topic with a real security surface.

## Done

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

### Extensions

- [x] WeebCentral (`com.weebcentral.en`)
- [x] MangaDex (`org.mangadex`)
- [x] MangaPill (`com.mangapill.en`)
- [x] NatoManga (`com.natomanga.en`) — written and fixture-tested. Only
  `chapters()` works live today; the rest wait on the Cloudflare bypass above.
- [x] WEBTOON (`com.webtoons.en`)

### Platform

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
