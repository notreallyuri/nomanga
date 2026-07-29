# TODO

## Open

### Extensions

- [ ] Comix (`com.comix.en`)
- [ ] AsuraScans (`asuracomic.net`) — not started. Behind Cloudflare but
  passing as of 2026-07-26, so its selectors can be verified against live
  HTML rather than saved fixtures. Manhwa-heavy.
- [ ] MangaPlus - not started.

### Extension distribution

- [ ] Check for extension updates in the background, the way library updates
  already do, instead of only on a visit to Settings → Extensions. The catalog
  fetch and the version comparison both exist; what is missing is a schedule
  and somewhere to surface "3 extensions have updates".

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
  - The injection point this needed now exists, built for MadaraDex: one
    `reqwest::cookie::Jar` is shared by the extension transport, the image
    proxy and the download worker, and `guest::set_cookie()` lets an extension
    write into it (ABI 4 → 5). Dropping a `cf_clearance` in is the same move
    MadaraDex makes with `mdx_fp`. The jar is in-memory, so a clearance does
    not survive a restart — persisting it is the open question, and it is a
    credential, so it wants the same care the debug export's redaction got.

### Library

- [ ] Update Behavior customization

#### Keep downloaded media compacted

### Browse

- [ ] Allow name-searching in all sources (does not include source-specific
  filters) — search-all bar stubbed in the browse landing; backend pending.

### Updates

- [ ] Tray menu implementation.

### Downloads and updates

- [ ] Cancel a library update run, in the updates progress dialog. Downloads
  now have this (below); `refresh_library` is still a plain loop emitting
  `LibraryRefreshProgress` that runs to completion whatever the user does.
  Cheaper than the download case was: an update fetches chapter lists and writes
  rows, so stopping between series leaves nothing half-written and needs no
  cleanup decision. Pause is probably not worth it here — a refresh is short.

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

### Extensions

- [x] Hitomi (`la.hitomi`)
- [x] WeebCentral (`com.weebcentral.en`)
- [x] MangaDex (`org.mangadex`)
- [x] MangaPill (`com.mangapill.en`)
- [x] NatoManga (`com.natomanga.en`) — written and fixture-tested. Only
  `chapters()` works live today; the rest wait on the Cloudflare bypass above.
- [x] WEBTOON (`com.webtoons.en`)
- [x] E-Hentai (`org.ehentai`) — verified live: homepage, search, cursor
  paging, details, chapters, and a 6-page gallery whose images all fetched 200.
  Two shapes worth remembering.
  *Pagination is cursor-only.* `?page=N` is accepted and silently ignored —
  pages 0, 1 and 3 come back byte-identical. The only pager is
  `?next=<gid of the last row>`, so the source keeps a static
  `listing url -> page -> cursor` map, filled as the user pages forward.
  Sequential paging costs one request per page; a cold jump to a deep page
  walks forward from the deepest cursor it knows. Chosen over widening the ABI
  because the client drives pagination, so a `cursor` field would have meant
  threading it through the browse UI too.
  *Pages are unavoidably request-heavy.* There is no bulk image-URL endpoint:
  image keys come from `/g/?p=N` (20 per request), one `/s/` page yields the
  gallery's `showkey`, then every remaining page needs its own `showpage` API
  call. ~0.7s per page measured, so a 55-page gallery is ~40s. `rate_limits()`
  caps Pages at 4/min, but note the limiter throttles *calls to the method*,
  not the requests made inside one — the internal loop is unthrottled, which is
  the main ban risk left.
  Images sit on sharded `*.hath.network` nodes on non-standard ports, need no
  referer, and carry a `keystamp` that expires on a ~5-minute bucket — stale
  URLs are expected for slow reads and queued downloads. The stable-looking
  `/r/` "forum image link" is not an alternative; it 404s.
  Auth is cookies, not a key: `ipb_member_id` + `ipb_pass_hash` seeded into the
  host jar via `guest::set_cookie()`. Optional, and both were left unset here,
  so the member branch (MPV image keys) is written but unverified. Automated
  login is not an option — `forums.e-hentai.org` is behind a Cloudflare
  interstitial, so it waits on the bypass above.
- [x] MadaraDex (`org.madaradex`) — verified live end to end: homepage (5
  sections), search, details, 218 chapters, pages.
  The site itself is open — no Cloudflare challenge — but `cdn.madaradex.org`
  serves a custom 403 for chapter images unless the request carries the
  `madaradex-shield` plugin's cookie pair. Covers are unaffected; they sit on
  `madaradex.org/wp-content` and need nothing.
  The pair is `mdx_fp`, a fingerprint only the page's own JavaScript generates,
  and `mdx_auth`, a ~6h token the server mints *against that fingerprint* — a
  token presented with a different fingerprint is rejected, so neither half is
  usable alone. `Referer` is required too, and the token is bound to the
  User-Agent that minted it.
  Two traps worth recording. The `mdx_auth` the chapter HTML sets is useless:
  that page is edge-cached, so its `Set-Cookie` is whatever was minted when the
  cache filled — which is exactly why the plugin re-mints over AJAX on every
  page view, and why `authorize()` runs per `pages()` call rather than once.
  And the UA binding was the whole reason the first working implementation
  still 403'd: the SDK minted under Firefox while the image proxy fetched under
  Chrome. `USER_AGENT` now lives in core and both sides use it — the app must
  present one identity per source, not two.

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
