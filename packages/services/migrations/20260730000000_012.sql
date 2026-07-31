-- Opt a source out of the cross-source search on Browse. Nothing reads this
-- yet -- the search-all command doesn't exist -- but the flag has to predate it
-- so a user's choice is already recorded when it ships, rather than every
-- source being swept in on the first run.
ALTER TABLE source_preference
    ADD COLUMN hide_from_search INTEGER NOT NULL DEFAULT 0;
