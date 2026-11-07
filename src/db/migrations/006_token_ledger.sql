-- 006_token_ledger.sql
-- Metered token flows, one row per event, so `somtum stats` reports what
-- Somtum actually spent and avoided instead of modeled estimates.
--
-- event values:
--   extraction          tokens sent to + returned by the extraction model
--   extraction_skipped  transcript tokens not sent (already extracted, or too small)
--   file_summary        tokens spent generating a file summary
--   injection           tokens Somtum added to an agent prompt
--   file_gate_denied    full-file tokens the agent was offered a summary instead of
--   file_gate_summary   summary tokens delivered in place of a full read
--   file_gate_reread    full-file tokens read anyway after a summary was offered

CREATE TABLE IF NOT EXISTS token_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT    NOT NULL,
  session_id  TEXT,
  event       TEXT    NOT NULL,
  tokens      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_project ON token_ledger(project_id, created_at);

-- Extraction cursor: how much of a session's transcript has been extracted,
-- so PreCompact followed by SessionEnd never re-sends the same turns.
CREATE TABLE IF NOT EXISTS session_progress (
  session_id       TEXT    PRIMARY KEY,
  project_id       TEXT    NOT NULL,
  turns_extracted  INTEGER NOT NULL,
  prefix_hash      TEXT    NOT NULL,
  updated_at       INTEGER NOT NULL
);
