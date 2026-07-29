-- Repositories the user added to install extensions from. The URL is the
-- identity; name is whatever the last fetched index called itself, kept so the
-- list can be labelled before a fetch succeeds.
CREATE TABLE extension_repository (
    url             TEXT NOT NULL PRIMARY KEY,
    name            TEXT NOT NULL,
    added_at        TEXT NOT NULL,
    last_fetched_at TEXT
);
