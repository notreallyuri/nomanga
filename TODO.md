# TODO

- [ ] Extensions:
  - [x] MangaPill (`com.mangapill.en`) — verified live via nomanga-cli.
  - [x] NatoManga (`com.natomanga.en`) — written and fixture-tested. Only
    `chapters()` works live today; the rest wait on the Cloudflare bypass below.
  - [x] WEBTOON (`com.webtoons.en`) — verified live via nomanga-cli. Episode
    lists cost one request per 10 episodes (no bulk endpoint exists: Naver's
    JSON API needs HMAC-signed requests and the RSS feed truncates at 20), so a
    650-episode series takes ~84s.
  - [ ] AsuraScans (`asuracomic.net`) — not started. Behind Cloudflare but
    passing as of 2026-07-26, so its selectors can be verified against live
    HTML rather than saved fixtures. Manhwa-heavy.
  - [ ] Hitomi - not started.
- [ ] Add a simple cloudfare bypass:
  - Invokes another window, user pass the cloudfare
  - Returns, the app grabs the cloudfare key.
  - Test target: the NatoManga source (`com.natomanga.en`). The challenge is
    route-scoped, not site-wide, but the opening is narrow: only
    `/api/manga/<slug>/chapters` answers unauthenticated. Everything that
    renders a page 403s with `cf-mitigated: challenge`, including the search
    box's own AJAX endpoint `/home/search/json`. Other `/api/manga/*` paths
    reach the origin but 404 — there is no listing/search/details API to use
    instead, so the bypass is genuinely required for those.
    So `chapters()` already works end to end live (verified: 66 chapters back
    to chapter 1, paging past the 50-row cap the detail page imposes), and
    homepage/search/manga/pages are the methods actually blocked. Their
    parsers are covered by fixture tests in
    `extensions/extension_mainpack/fixtures/natomanga/`; the one field those
    fixtures cannot prove is the detail-page cover, read from the JSON-LD blob
    because "save page as" rewrote the real `src`.
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
- [ ] Updates:
  - [x] Move Update visualization to the bottom of the sidebar.
  - [x] Add a better updates visualization on the bottom of the sidebar,
    allowing users to see anywhere in the app the current state.
    (Persistent sidebar indicator + detailed progress dialog with a per-series
    live log; plus a "Clear" action that dismisses the current updates without
    marking them read.)
  - [x] Add support for background updates (configurable interval in System
    settings, off by default; desktop notification on new chapters).
  - [ ] Tray menu implementation.
- [ ] Library:
  - [x] Listing layout (Allow user to toggle the layout in the library)
  - [x] Badge Toggle
  - [x] Quick filters
  - [x] Chapter selection + read-state actions in the manga details route
    (Shift-click range select, plus "Select all above" / "Select all below" /
    "Select up to here" in the row menu — all measured against the rows as
    displayed, so they respect the current sort and filter and span pages.
    The bulk read action is now a single button inferred from the topmost
    selected chapter: read → "Mark unread", unread → "Mark read".)
  - [ ] Update Behavior customization
  - [x] Downloads
    (Per-chapter + bulk download to disk, delete, and offline reading via the
    asset protocol. A background queue worker fetches pages over reqwest and
    streams DownloadProgress events to a persistent sidebar indicator + queue
    dialog. Chapter table shows per-row download/delete state.)
- [ ] Browse:
  - [ ] Allow name-searching in all sources (does not include source-specific
    filters) — search-all bar stubbed in the browse landing; backend pending.
- [x] UI:
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
