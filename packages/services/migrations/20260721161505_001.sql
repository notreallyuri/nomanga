PRAGMA foreign_keys = ON;

CREATE TABLE manga (
    source_id     TEXT    NOT NULL,
    manga_id      TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    cover_url     TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    authors       TEXT    NOT NULL DEFAULT '[]',
    artists       TEXT    NOT NULL DEFAULT '[]',
    tags          TEXT    NOT NULL DEFAULT '[]',
    status        TEXT    NOT NULL DEFAULT 'Unknown',
    cached_at     TEXT    NOT NULL,   
    PRIMARY KEY (source_id, manga_id)
);
CREATE INDEX idx_manga_title ON manga (title);

CREATE TABLE library_entry (
    source_id              TEXT    NOT NULL,
    manga_id               TEXT    NOT NULL,
    added_at               TEXT    NOT NULL,
    cached_total_chapters  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, manga_id),
    FOREIGN KEY (source_id, manga_id)
        REFERENCES manga (source_id, manga_id) ON DELETE CASCADE
);
CREATE INDEX idx_library_added_at ON library_entry (added_at);

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

CREATE TABLE read_chapter (
    source_id   TEXT    NOT NULL,
    manga_id    TEXT    NOT NULL,
    chapter_id  TEXT    NOT NULL,
    read_at     TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id, chapter_id)
);
CREATE INDEX idx_read_chapter_manga ON read_chapter (source_id, manga_id);

CREATE TABLE read_progress (
    source_id           TEXT    NOT NULL,
    manga_id            TEXT    NOT NULL,
    last_chapter_id     TEXT    NOT NULL,
    last_page           INTEGER NOT NULL DEFAULT 0,
    last_chapter_done   INTEGER NOT NULL DEFAULT 0,
    updated_at          TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id)
);
CREATE INDEX idx_read_progress_updated ON read_progress (updated_at);

CREATE TABLE source_preference (
    source_id      TEXT NOT NULL PRIMARY KEY,
    enabled        INTEGER NOT NULL DEFAULT 1,
    private        INTEGER NOT NULL DEFAULT 0,
    blur_covers    INTEGER NOT NULL DEFAULT 0,
    skip_updates   INTEGER NOT NULL DEFAULT 0   
);

CREATE TABLE source_setting (
  source_id       TEXT NOT NULL,
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  PRIMARY KEY (source_id, key)
);


CREATE TABLE source_cache (
    source_id       TEXT    NOT NULL,
    kind            TEXT    NOT NULL,
    payload         TEXT    NOT NULL,
    source_version  TEXT    NOT NULL,
    cached_at       TEXT    NOT NULL,
    PRIMARY KEY (source_id, kind)
);
