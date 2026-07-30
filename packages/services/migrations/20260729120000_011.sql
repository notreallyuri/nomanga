-- Sources now default to disabled so the host only pays to compile a source's
-- wasm once the user has opted into it. A source with no row here reads as off,
-- which would silently retire every source an existing user never toggled by
-- hand -- so grandfather in anything they demonstrably used. A fresh install
-- has nothing in these tables and correctly starts with everything off.
INSERT OR IGNORE INTO source_preference (source_id, enabled)
SELECT source_id, 1
FROM (
    SELECT source_id FROM library_entry
    UNION
    SELECT source_id FROM read_chapter
    UNION
    SELECT source_id FROM read_progress
    UNION
    SELECT source_id FROM source_setting
    UNION
    SELECT source_id FROM downloaded_chapter
);
