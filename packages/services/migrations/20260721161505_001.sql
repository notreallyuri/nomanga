-- nomanga library schema.
--
-- Identity everywhere is the (source_id, manga_id) pair — the same natural
-- key the extension ABI uses, so DB rows and source calls agree without a
-- translation layer. chapter_id is source-scoped too.
--
-- Three concerns kept deliberately separate:
--   * manga            — cached metadata (may exist without being saved)
--   * library_entry    — what the user actually saved
--   * read_chapter / read_progress — history & resume state
-- so browsing can populate the cache without touching the library, and the
-- library table stays lean.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Metadata cache. Populated whenever details are fetched, library or not.
-- ---------------------------------------------------------------------------
CREATE TABLE manga (
    source_id     TEXT    NOT NULL,
    manga_id      TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    cover_url     TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    -- JSON arrays: rarely queried relationally in a reader, so a normalized
    -- table would be ceremony. Stored as JSON text, parsed app-side.
    authors       TEXT    NOT NULL DEFAULT '[]',
    artists       TEXT    NOT NULL DEFAULT '[]',
    tags          TEXT    NOT NULL DEFAULT '[]',
    -- Mirrors nomanga_core::data::manga::Status variants.
    status        TEXT    NOT NULL DEFAULT 'Unknown',
    cached_at     TEXT    NOT NULL,   -- unix seconds; lets you age the cache
    PRIMARY KEY (source_id, manga_id)
);
CREATE INDEX idx_manga_title ON manga (title);

-- ---------------------------------------------------------------------------
-- Library: the user's saved series.
-- ---------------------------------------------------------------------------
CREATE TABLE library_entry (
    source_id              TEXT    NOT NULL,
    manga_id               TEXT    NOT NULL,
    added_at               TEXT    NOT NULL,
    -- Snapshot of chapter count at last update, for the "N new chapters" badge.
    cached_total_chapters  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, manga_id),
    FOREIGN KEY (source_id, manga_id)
        REFERENCES manga (source_id, manga_id) ON DELETE CASCADE
);
CREATE INDEX idx_library_added_at ON library_entry (added_at);

-- ---------------------------------------------------------------------------
-- Categories (shelves) — many-to-many with library entries.
-- ---------------------------------------------------------------------------
CREATE TABLE category (
    id          TEXT    NOT NULL PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE library_entry_category (
    source_id    TEXT NOT NULL,
    manga_id     TEXT NOT NULL,
    category_id  TEXT NOT NULL,
    PRIMARY KEY (source_id, manga_id, category_id),
    FOREIGN KEY (source_id, manga_id)
        REFERENCES library_entry (source_id, manga_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id)
        REFERENCES category (id) ON DELETE CASCADE
);
CREATE INDEX idx_lec_category ON library_entry_category (category_id);

-- ---------------------------------------------------------------------------
-- Read history: per-chapter "have I read this" (the normalization fix —
-- Torigen stored this as a JSON array; a real table makes "is X read" a
-- query and "mark read" an insert, not a read-modify-write of a blob).
-- ---------------------------------------------------------------------------
CREATE TABLE read_chapter (
    source_id   TEXT    NOT NULL,
    manga_id    TEXT    NOT NULL,
    chapter_id  TEXT    NOT NULL,
    read_at     TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id, chapter_id)
);
CREATE INDEX idx_read_chapter_manga ON read_chapter (source_id, manga_id);

-- ---------------------------------------------------------------------------
-- Resume state: one row per manga, "where was I". Powers "Continue reading".
-- Separate from read_chapter because it answers a different question (last
-- position vs. the full read set) and is updated on every page turn.
-- ---------------------------------------------------------------------------
CREATE TABLE read_progress (
    source_id           TEXT    NOT NULL,
    manga_id            TEXT    NOT NULL,
    last_chapter_id     TEXT    NOT NULL,
    last_page           INTEGER NOT NULL DEFAULT 0,
    -- Whether the last chapter was finished (vs. mid-read), so "continue"
    -- can decide between resuming this chapter or advancing to the next.
    last_chapter_done   INTEGER NOT NULL DEFAULT 0,   -- boolean 0/1
    updated_at          TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id)
);
CREATE INDEX idx_read_progress_updated ON read_progress (updated_at);

CREATE TABLE source_preference (
    source_id      TEXT NOT NULL PRIMARY KEY,
    enabled        INTEGER NOT NULL DEFAULT 1,  -- show in source list at all
    private        INTEGER NOT NULL DEFAULT 0,  -- record progress, hide from history
    blur_covers    INTEGER NOT NULL DEFAULT 0,
    skip_updates   INTEGER NOT NULL DEFAULT 0   -- exclude from library update runs
);
