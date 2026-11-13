-- 007_git_branch.sql
-- The branch and commit a memory was captured on. Memories from another
-- branch that still exists and is not merged into the current one are not
-- recalled, so parallel branches can't feed each other conflicting decisions.
-- NULL for memories captured before 3.2 or outside a git repository: those
-- stay visible everywhere.

ALTER TABLE observations ADD COLUMN git_branch TEXT;
ALTER TABLE observations ADD COLUMN git_commit TEXT;
-- 1 when the branch had no commits of its own yet. Git then sees the branch as
-- already merged into its base, so ancestry can't tell an untouched experiment
-- from finished work; such memories stay with their branch until it's deleted.
ALTER TABLE observations ADD COLUMN git_before_first_commit INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_observations_branch ON observations(project_id, git_branch);
