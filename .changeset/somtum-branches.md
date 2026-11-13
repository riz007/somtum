---
'somtum': minor
---

Branch-aware memory, `somtum backfill`, and a lighter, audit-clean install.

- **Branch-aware memory.** Each memory records the git branch and commit it was captured on. Recall leaves out memories from another branch that still exists and isn't merged into the current one, so parallel branches that decide differently don't feed each other contradictions. Memories from the current branch, the default branch, merged branches and deleted branches (including squash-merged pull requests) stay visible, as do memories captured before 3.2. A session captured before its branch's first commit stays with that branch until the branch is deleted. When two visible memories cover the same decision, only the newer is injected, and injected memories now show their age and, if from another branch, its name. A branch can only supersede its own memories, and supersession compares dates rather than insertion order.
- **`somtum backfill`** extracts memories from the most recent past Claude Code and Codex sessions of a project, so a new install doesn't start empty. It shows each session's token cost first, asks before sending, skips sessions already extracted, processes oldest first and keeps each session's date and branch. `--dry-run`, `--limit`, `--agent`, `--yes`.
- **`somtum forget --branch <name>`** drops an abandoned branch's memories.
- **`@xenova/transformers` is now an optional dependency.** Installs are about 250 MB smaller and `npm audit` reports no vulnerabilities (3.1.1 had 7 high). Semantic search needs `npm install -g @xenova/transformers`; `somtum doctor` flags it when embeddings are enabled without it.
- **Embeddings and hybrid search now work** from `somtum search`, the dashboard and MCP `recall`. They previously failed with "No embedder configured" everywhere except the hooks. When unavailable they fall back to BM25, and `somtum search` says so.
- Upgraded to zod 4.
- The MCP server reports the package version instead of a hardcoded `1.4.0`.
- `somtum import` fills in a missing `project_id` and `session_id`, and reports an invalid record as one line naming the record and field.
- The prompt header and `somtum stats` now count injected tokens the same way.
- The extraction transcript cap is measured in tokens rather than estimated from characters, so dense transcripts no longer exceed 60k tokens.
