-- 004_scope_and_staleness.sql
-- Adds observation scope (project/workspace/global) for cross-project memory sharing,
-- and last_confirmed_at to track staleness (bumped on every successful retrieval).

ALTER TABLE observations ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'
  CHECK (scope IN ('project','workspace','global'));

ALTER TABLE observations ADD COLUMN last_confirmed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_observations_scope ON observations(scope);
CREATE INDEX IF NOT EXISTS idx_observations_confirmed ON observations(last_confirmed_at);
