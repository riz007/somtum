// Hot-path benchmark: UserPromptSubmit cache lookup latency.
// p95 must stay under 150ms on a 1000-observation corpus (CLAUDE.md non-negotiable).
// p95 must stay under 300ms on a 10k-observation corpus (SPEC.md §14).
//
// Run: pnpm test:bench
import { bench, describe, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { MemoryStore } from '../../src/core/store.js';
import { PromptCache } from '../../src/core/cache.js';
import { Bm25Retriever } from '../../src/core/retriever/bm25.js';

const PROJECT_ID = 'bench-project';
const SESSION_ID = 'bench-session';

const KINDS = ['decision', 'learning', 'bugfix', 'command', 'other'] as const;
const WORDS = ['sqlite', 'pnpm', 'zod', 'hooks', 'embeddings', 'config', 'cache', 'retrieval', 'privacy', 'index'];

function randTitle(i: number): string {
  const w1 = WORDS[i % WORDS.length] ?? 'unknown';
  const w2 = WORDS[(i + 3) % WORDS.length] ?? 'unknown';
  return `${KINDS[i % KINDS.length]} for ${w1} and ${w2} (${i})`;
}

function randBody(i: number): string {
  return `Observation ${i}. Describes a ${i % 2 === 0 ? 'decision' : 'learning'} about SQLite, ` +
    `embeddings, hooks, configuration, privacy, caching, and retrieval. ` +
    `Fix applied in commit ${i * 13}. Files: src/core/db.ts, src/core/store.ts, src/hooks/post_session.ts.`;
}

function seedDb(db: InstanceType<typeof Database>, count: number): { store: MemoryStore; cache: PromptCache } {
  runMigrations(db);
  const store = new MemoryStore(db);
  const cache = new PromptCache(db);
  for (let i = 0; i < count; i += 1) {
    store.insert({
      project_id: PROJECT_ID,
      session_id: SESSION_ID,
      kind: KINDS[i % KINDS.length] as 'decision',
      title: randTitle(i).slice(0, 80),
      body: randBody(i),
      files: [`src/core/file${i % 10}.ts`],
      tags: [`tag${i % 20}`],
      tokens_saved: 100 + (i % 200),
      tokens_spent: 25 + (i % 50),
    });
  }
  for (let i = 0; i < 100; i += 1) {
    cache.put({
      prompt_hash: `hash${i}`,
      prompt_text: `User prompt ${i} about ${WORDS[i % WORDS.length]}`,
      response: `Response ${i}`,
      model: 'claude-haiku-4-5-20251001',
      context_fingerprint: `fp${i % 10}`,
      files_touched: [`src/core/file${i % 10}.ts`],
    });
  }
  return { store, cache };
}

// ── 1k corpus ──────────────────────────────────────────────────────────────

let db1k: InstanceType<typeof Database>;
let store1k: MemoryStore;
let cache1k: PromptCache;

beforeAll(() => {
  db1k = new Database(':memory:');
  db1k.pragma('journal_mode = WAL');
  db1k.pragma('foreign_keys = ON');
  ({ store: store1k, cache: cache1k } = seedDb(db1k, 1_000));
});

afterAll(() => {
  db1k.close();
});

describe('UserPromptSubmit hot-path — 1k memories (p95 budget: 150ms)', () => {
  bench('exact cache hash lookup (hit)', () => {
    cache1k.lookupByHash('hash42');
  });

  bench('exact cache hash lookup (miss)', () => {
    cache1k.lookupByHash('definitely-not-a-real-hash-xxxxxxxxx');
  });

  bench('BM25 search k=8 (typical recall query)', async () => {
    const retriever = new Bm25Retriever(db1k);
    await retriever.search('sqlite hooks configuration decision', { k: 8, projectId: PROJECT_ID });
  });

  bench('BM25 search k=8 (no matches)', async () => {
    const retriever = new Bm25Retriever(db1k);
    await retriever.search('nonexistent term xyzzy quux', { k: 8, projectId: PROJECT_ID });
  });

  bench('MemoryStore.countByProject', () => {
    store1k.countByProject(PROJECT_ID);
  });

  bench('MemoryStore.totalTokensSaved', () => {
    store1k.totalTokensSaved(PROJECT_ID);
  });

  bench('PromptCache.count', () => {
    cache1k.count();
  });
});

// ── 10k corpus ─────────────────────────────────────────────────────────────

let db10k: InstanceType<typeof Database>;
let store10k: MemoryStore;
let cache10k: PromptCache;

beforeAll(() => {
  db10k = new Database(':memory:');
  db10k.pragma('journal_mode = WAL');
  db10k.pragma('foreign_keys = ON');
  ({ store: store10k, cache: cache10k } = seedDb(db10k, 10_000));
});

afterAll(() => {
  db10k.close();
});

describe('UserPromptSubmit hot-path — 10k memories (p95 budget: 300ms)', () => {
  bench('exact cache hash lookup (hit) @10k', () => {
    cache10k.lookupByHash('hash42');
  });

  bench('exact cache hash lookup (miss) @10k', () => {
    cache10k.lookupByHash('definitely-not-a-real-hash-xxxxxxxxx');
  });

  bench('BM25 search k=8 @10k', async () => {
    const retriever = new Bm25Retriever(db10k);
    await retriever.search('sqlite hooks configuration decision', { k: 8, projectId: PROJECT_ID });
  });

  bench('MemoryStore.countByProject @10k', () => {
    store10k.countByProject(PROJECT_ID);
  });

  bench('MemoryStore.listRecent (7d) @10k', () => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    store10k.listRecent(PROJECT_ID, since, 100);
  });

  bench('topFileReferences @10k', () => {
    store10k.topFileReferences(PROJECT_ID, 20);
  });
});
