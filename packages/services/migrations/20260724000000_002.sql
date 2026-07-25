-- Category options: private (hidden from All), a single default category that
-- new library entries auto-join, per-category sort, and a cosmetic color/icon.

ALTER TABLE category ADD COLUMN hidden     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE category ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
ALTER TABLE category ADD COLUMN sort_mode  TEXT    NOT NULL DEFAULT 'added';
ALTER TABLE category ADD COLUMN color      TEXT;
ALTER TABLE category ADD COLUMN icon       TEXT;

-- At most one category may be the default.
CREATE UNIQUE INDEX idx_category_default ON category (is_default) WHERE is_default = 1;
