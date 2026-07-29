ALTER TABLE category ADD COLUMN locked BOOLEAN NOT NULL DEFAULT 0;

-- One password guards every locked category, so this holds a single row. The
-- hash is a PHC string (argon2id), self-describing about its own parameters.
CREATE TABLE library_lock (
    id            INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
    password_hash TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

-- Where this source's additions get filed. NULL falls back to the library-wide
-- default category.
ALTER TABLE source_preference
    ADD COLUMN default_category_id TEXT REFERENCES category (id) ON DELETE SET NULL;
