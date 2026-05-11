-- 005_dedup_index.sql
-- Index to efficiently exclude superseded observations from retrieval queries.
-- superseded_by is set by the dedup pass in post_session when a new observation
-- replaces a near-duplicate from a prior session.

CREATE INDEX IF NOT EXISTS idx_observations_superseded ON observations(superseded_by);
