CREATE TABLE image_cache (
    key          TEXT    PRIMARY KEY,
    url          TEXT    NOT NULL,
    content_type TEXT    NOT NULL,
    byte_size    INTEGER NOT NULL,
    created_at   TEXT    NOT NULL,
    accessed_at  TEXT    NOT NULL
);

-- Eviction walks the table in least-recently-used order.
CREATE INDEX idx_image_cache_accessed ON image_cache (accessed_at);
