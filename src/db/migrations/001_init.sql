-- 001_init.sql
-- Initial schema: observations (+ FTS5), cache_entries, file_fingerprints.
-- SQLite is the source of truth; the markdown index is a derived mirror.

CREATE TABLE IF NOT EXISTS observations (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  session_id          TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('decision','learning','bugfix','file_summary','command','other')),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  files               TEXT NOT NULL DEFAULT '[]', -- JSON array
  tags                TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at          INTEGER NOT NULL,
  tokens_saved        INTEGER NOT NULL DEFAULT 0,
  tokens_spent        INTEGER NOT NULL DEFAULT 0, -- extraction cost; used by stats
  superseded_by       TEXT,
  embedding           BLOB,                        -- 384-dim f32, populated once embeddings land
  deleted_at          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_observations_project    ON observations(project_id);
CREATE INDEX IF NOT EXISTS idx_observations_session    ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_observations_created    ON observations(created_at);
CREATE INDEX IF NOT EXISTS idx_observations_kind       ON observations(kind);
CREATE INDEX IF NOT EXISTS idx_observations_deleted    ON observations(deleted_at);

-- FTS5 index over title + body + tags. BM25 retriever reads this directly.
-- `content='observations'` makes the FTS table an external-content table; triggers keep it in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title,
  body,
  tags,
  content='observations',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS observations_ai
AFTER INSERT ON observations
BEGIN
  INSERT INTO observations_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS observations_ad
AFTER DELETE ON observations
BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS observations_au
AFTER UPDATE ON observations
BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  INSERT INTO observations_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

CREATE TABLE IF NOT EXISTS cache_entries (
  id                    TEXT PRIMARY KEY,
  prompt_hash           TEXT NOT NULL UNIQUE,
  prompt_text           TEXT NOT NULL,
  prompt_embedding      BLOB,
  response              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  context_fingerprint   TEXT NOT NULL,
  fingerprint_version   INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  last_hit_at           INTEGER NOT NULL,
  hit_count             INTEGER NOT NULL DEFAULT 0,
  false_hit_count       INTEGER NOT NULL DEFAULT 0,
  invalidated           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_prompt_hash ON cache_entries(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_cache_last_hit    ON cache_entries(last_hit_at);

CREATE TABLE IF NOT EXISTS file_fingerprints (
  project_id     TEXT NOT NULL,
  path           TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  mtime          INTEGER NOT NULL,
  tokens         INTEGER NOT NULL,
  summary        TEXT,
  summary_hash   TEXT,
  PRIMARY KEY (project_id, path)
);
