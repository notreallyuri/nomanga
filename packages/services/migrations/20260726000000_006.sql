CREATE TABLE downloaded_chapter (
    source_id     TEXT    NOT NULL,
    manga_id      TEXT    NOT NULL,
    chapter_id    TEXT    NOT NULL,
    page_count    INTEGER NOT NULL,
    total_bytes   INTEGER NOT NULL DEFAULT 0,
    downloaded_at TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id, chapter_id)
);
CREATE INDEX idx_downloaded_chapter_manga ON downloaded_chapter (source_id, manga_id);

CREATE TABLE downloaded_page (
    source_id   TEXT    NOT NULL,
    manga_id    TEXT    NOT NULL,
    chapter_id  TEXT    NOT NULL,
    number      INTEGER NOT NULL,
    path        TEXT    NOT NULL,
    PRIMARY KEY (source_id, manga_id, chapter_id, number),
    FOREIGN KEY (source_id, manga_id, chapter_id)
        REFERENCES downloaded_chapter (source_id, manga_id, chapter_id) ON DELETE CASCADE
);
