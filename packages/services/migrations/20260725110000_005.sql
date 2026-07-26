-- Records when the user last cleared the "new chapters" indicator for a series.
-- Chapters first seen at or before this timestamp are no longer surfaced as
-- updates, so clearing dismisses the current set without marking them read.
ALTER TABLE library_entry ADD COLUMN updates_cleared_at TEXT;
