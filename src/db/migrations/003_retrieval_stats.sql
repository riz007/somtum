-- 003_retrieval_stats.sql
-- Per-project, per-strategy retrieval counters and total cache hit tracking.

CREATE TABLE IF NOT EXISTS retrieval_stats (
  project_id   TEXT    NOT NULL,
  strategy     TEXT    NOT NULL,
  call_count   INTEGER NOT NULL DEFAULT 0,
  last_called_at INTEGER,
  PRIMARY KEY (project_id, strategy)
);

CREATE TABLE IF NOT EXISTS cache_hit_stats (
  project_id   TEXT    NOT NULL PRIMARY KEY,
  hit_count    INTEGER NOT NULL DEFAULT 0,
  miss_count   INTEGER NOT NULL DEFAULT 0,
  last_hit_at  INTEGER
);
