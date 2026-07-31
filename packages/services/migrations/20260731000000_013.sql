CREATE TABLE download_queue (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   TEXT NOT NULL,
    manga_id    TEXT NOT NULL,
    manga_title TEXT NOT NULL,
    chapter_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    queued_at   TEXT NOT NULL,
    UNIQUE (source_id, manga_id, chapter_id)
);
