CREATE TABLE cached_chapter (
    source_id     TEXT NOT NULL,
    manga_id      TEXT NOT NULL,
    chapter_id    TEXT NOT NULL,
    number        REAL NOT NULL,
    title         TEXT NOT NULL,
    volume        REAL,
    language      TEXT NOT NULL,
    upload_date   TEXT NOT NULL,
    url           TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (source_id, manga_id, chapter_id)
);

ALTER TABLE library_entry ADD COLUMN last_checked_at TEXT;
