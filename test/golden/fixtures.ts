// Shared fixture helpers for golden retrieval tests.
// Creates an in-memory SQLite DB seeded with a known set of observations,
// then checks that a set of queries each return the expected IDs within top-k.
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { MemoryStore } from '../../src/core/store.js';
import type { ObservationInput } from '../../src/core/schema.js';

export const PROJECT_ID = 'golden-test-project';
export const SESSION_ID = 'golden-test-session';

// Canonical set of observations used across all strategy tests.
// Each entry has a stable `id` so golden sets can reference it by name.
export const OBSERVATIONS: ObservationInput[] = [
  {
    id: 'obs-sqlite-wal',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Use SQLite WAL mode for concurrent reads',
    body: 'Enabled WAL journal mode because it allows multiple concurrent readers without blocking the writer. This is critical for the MCP server and CLI running in parallel.',
    files: ['src/core/db.ts'],
    tags: ['sqlite', 'performance', 'concurrency'],
    tokens_saved: 120,
    tokens_spent: 30,
  },
  {
    id: 'obs-pnpm-workspace',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'pnpm chosen over npm for consistent lockfile',
    body: 'Using pnpm because it produces a deterministic lockfile and faster installs via content-addressed storage. npm and yarn are not supported; do not switch without discussion.',
    files: ['package.json', 'pnpm-lock.yaml'],
    tags: ['pnpm', 'packaging', 'tooling'],
    tokens_saved: 80,
    tokens_spent: 20,
  },
  {
    id: 'obs-zod-validation',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'learning',
    title: 'Zod validation must run at every system boundary',
    body: 'Discovered that skipping zod on hook stdin input caused a runtime panic when Claude Code sent a payload with an extra field. Now all external inputs are validated before use.',
    files: ['src/hooks/post_session.ts', 'src/core/schema.ts'],
    tags: ['zod', 'validation', 'hooks'],
    tokens_saved: 200,
    tokens_spent: 50,
  },
  {
    id: 'obs-fts5-query-escape',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'bugfix',
    title: 'FTS5 query syntax error on punctuated user input',
    body: 'SQLite FTS5 MATCH raised "fts5: syntax error" when user queries contained bare punctuation like hyphens or quotes. Fixed by quoting each token individually using the double-quote form.',
    files: ['src/core/retriever/bm25.ts'],
    tags: ['fts5', 'bm25', 'bug', 'sqlite'],
    tokens_saved: 300,
    tokens_spent: 60,
  },
  {
    id: 'obs-embedding-dim',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Use bge-small-en-v1.5 at 384 dimensions for embeddings',
    body: 'Chose bge-small-en-v1.5 because it is 30MB quantized, runs on CPU via ONNX, and has strong performance for retrieval tasks relative to its size. Vectors stored as Float32 Buffer in SQLite.',
    files: ['src/core/embeddings.ts', 'src/core/embeddings_xenova.ts'],
    tags: ['embeddings', 'vector', 'bge', 'onnx'],
    tokens_saved: 180,
    tokens_spent: 45,
  },
  {
    id: 'obs-hook-stdin-parse',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'learning',
    title: 'Hook stdin has no trailing newline — readToEnd before JSON.parse',
    body: 'Claude Code sends hook payloads as JSON on stdin without a trailing newline. Parsing line-by-line caused incomplete reads. Must buffer all stdin before calling JSON.parse.',
    files: ['src/hooks/post_session.ts', 'src/hooks/pre_prompt.ts'],
    tags: ['hooks', 'stdin', 'parsing', 'gotcha'],
    tokens_saved: 150,
    tokens_spent: 35,
  },
  {
    id: 'obs-redact-unconditional',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Redaction runs unconditionally on every capture',
    body: 'Privacy.redact() is called before every DB write regardless of the telemetry setting. This prevents accidental secret capture even if the user turns off telemetry after setup.',
    files: ['src/core/privacy.ts', 'src/core/store.ts'],
    tags: ['privacy', 'security', 'redaction'],
    tokens_saved: 100,
    tokens_spent: 25,
  },
  {
    id: 'obs-rrf-blend',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Use Reciprocal Rank Fusion for hybrid retrieval blending',
    body: 'RRF with k=60 merges BM25 and embeddings ranked lists without requiring score normalization. It is parameter-light, well-studied, and performs consistently across query types.',
    files: ['src/core/retriever/hybrid.ts'],
    tags: ['rrf', 'hybrid', 'retrieval', 'ranking'],
    tokens_saved: 220,
    tokens_spent: 55,
  },
  {
    id: 'obs-config-merge',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Deep merge project config over global config',
    body: 'Project .somtum/config.json overrides global ~/.somtum/config.json. Uses a recursive deep-merge so nested keys (e.g. retrieval.embeddings.enabled) can be selectively overridden.',
    files: ['src/config.ts'],
    tags: ['config', 'merge'],
    tokens_saved: 90,
    tokens_spent: 22,
  },
  {
    id: 'obs-haiku-rerank',
    project_id: PROJECT_ID,
    session_id: SESSION_ID,
    kind: 'decision',
    title: 'Haiku-backed reranking in hybrid pipeline',
    body: 'After BM25 and embeddings produce top-50 each, a Haiku rerank call picks the final top-k. This adds one LLM call but substantially improves precision on paraphrased queries.',
    files: ['src/core/retriever/hybrid.ts', 'src/core/retriever/llm_index.ts'],
    tags: ['rerank', 'haiku', 'hybrid', 'quality'],
    tokens_saved: 250,
    tokens_spent: 65,
  },
];

// Golden queries: each entry specifies a search query and the IDs that MUST
// appear in the top-k results (recall@k). The test passes if all expectedIds
// are present in the result set, regardless of order.
export interface GoldenQuery {
  query: string;
  k: number;
  // IDs that must be present in top-k results.
  expectedIds: string[];
  description?: string;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  {
    query: 'sqlite wal mode concurrent reads',
    k: 3,
    expectedIds: ['obs-sqlite-wal'],
    description: 'exact term match',
  },
  {
    query: 'bm25 FTS5 syntax error user input',
    k: 3,
    expectedIds: ['obs-fts5-query-escape'],
    description: 'BM25 bugfix',
  },
  {
    query: 'hook stdin parsing no newline',
    k: 3,
    expectedIds: ['obs-hook-stdin-parse'],
    description: 'hook stdin gotcha',
  },
  {
    query: 'zod validation schema boundary',
    k: 3,
    expectedIds: ['obs-zod-validation'],
    description: 'zod validation learning',
  },
  {
    query: 'embeddings quantized onnx vectors dimensions',
    k: 3,
    expectedIds: ['obs-embedding-dim'],
    description: 'embedding model decision',
  },
  {
    query: 'privacy redact secrets api keys',
    k: 3,
    expectedIds: ['obs-redact-unconditional'],
    description: 'privacy redaction',
  },
  {
    query: 'package manager lockfile pnpm',
    k: 3,
    expectedIds: ['obs-pnpm-workspace'],
    description: 'pnpm decision',
  },
  {
    query: 'hybrid retrieval rank fusion blend',
    k: 3,
    expectedIds: ['obs-rrf-blend', 'obs-haiku-rerank'],
    description: 'hybrid retrieval',
  },
];

export function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  const store = new MemoryStore(db);
  for (const obs of OBSERVATIONS) {
    store.insert(obs);
  }
  return { db, store };
}

// Compute recall@k: fraction of expected IDs that appear in the result set.
export function recallAtK(resultIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 1;
  const resultSet = new Set(resultIds);
  const hits = expectedIds.filter((id) => resultSet.has(id)).length;
  return hits / expectedIds.length;
}
