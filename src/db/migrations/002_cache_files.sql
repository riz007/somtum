-- 002_cache_files.sql
-- Track the files referenced by a cached prompt/response pair so we can
-- re-hash them on lookup and invalidate stale entries. Without this column
-- we have no way to know which files to fingerprint.

ALTER TABLE cache_entries ADD COLUMN files_touched TEXT NOT NULL DEFAULT '[]';
