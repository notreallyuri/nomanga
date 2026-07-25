CREATE TABLE reader_override (
    source_id TEXT NOT NULL,
    manga_id  TEXT NOT NULL DEFAULT '',
    data      TEXT NOT NULL,
    PRIMARY KEY (source_id, manga_id)
);
