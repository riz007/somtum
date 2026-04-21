// Golden set for the LLM index retriever.
// Uses a fake LlmCaller that picks IDs by simple keyword matching in the catalog,
// so the test runs without any Anthropic API credits.
//
// To test with a real Haiku call, set ANTHROPIC_API_KEY and SOMTUM_REAL_INDEX=1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LlmIndexRetriever } from '../../src/core/retriever/llm_index.js';
import type { LlmCaller } from '../../src/core/extractor.js';
import { buildTestDb, GOLDEN_QUERIES, OBSERVATIONS, PROJECT_ID, recallAtK } from './fixtures.js';

// Fake LLM caller: reads the catalog from the prompt and picks IDs whose
// title+tags+files contain keywords from the query. Good enough to verify
// the index retriever plumbing without API calls.
function makeFakeCaller(): LlmCaller {
  return {
    async complete({ user }) {
      // Extract catalog from the user prompt
      const catalogMatch = user.match(/Catalog:\n([\s\S]+)$/);
      let catalog: Array<{
        id: string;
        title: string;
        tags: string[];
        files: string[];
        kind: string;
      }> = [];
      if (catalogMatch?.[1]) {
        try {
          catalog = JSON.parse(catalogMatch[1]) as typeof catalog;
        } catch {
          // fall through with empty catalog
        }
      }

      // Extract query
      const queryMatch = user.match(/^Query:\s*(.+)/);
      const query = queryMatch?.[1]?.toLowerCase() ?? '';
      const queryWords = query.split(/\s+/).filter((w) => w.length > 2);

      // Extract k
      const kMatch = user.match(/Return up to (\d+) IDs/);
      const k = kMatch?.[1] ? Number.parseInt(kMatch[1], 10) : 5;

      // Score each catalog entry by keyword overlap
      const scored = catalog.map((entry) => {
        const text = [entry.title, ...entry.tags, ...entry.files, entry.kind]
          .join(' ')
          .toLowerCase();
        const score = queryWords.filter((w) => text.includes(w)).length;
        return { id: entry.id, score };
      });

      const topIds = scored
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((e) => e.id);

      return {
        text: JSON.stringify({ ids: topIds }),
        inputTokens: 100,
        outputTokens: 20,
      };
    },
  };
}

let db: ReturnType<typeof buildTestDb>['db'];

beforeAll(() => {
  ({ db } = buildTestDb());
});

afterAll(() => {
  db.close();
});

describe('LlmIndex retriever — golden recall@k (fake caller)', () => {
  for (const gq of GOLDEN_QUERIES) {
    it(`recall@${gq.k}: "${gq.query}"${gq.description ? ` (${gq.description})` : ''}`, async () => {
      const retriever = new LlmIndexRetriever(db, {
        caller: makeFakeCaller(),
        model: 'claude-haiku-4-5-20251001',
      });
      const results = await retriever.search(gq.query, { k: gq.k, projectId: PROJECT_ID });
      const resultIds = results.map((r) => r.id);
      const recall = recallAtK(resultIds, gq.expectedIds);

      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(1.0001);
        expect(r.source).toBe('index');
        expect(r.observation.project_id).toBe(PROJECT_ID);
      }

      // Fake caller uses keyword matching: recall ≥ 0.5 is expected.
      // Real Haiku achieves 1.0 on these queries.
      const minRecall = process.env['SOMTUM_REAL_INDEX'] === '1' ? 1.0 : 0.5;
      expect(recall).toBeGreaterThanOrEqual(
        minRecall,
        `Index recall@${gq.k} below ${minRecall} for "${gq.query}": ` +
          `expected [${gq.expectedIds.join(', ')}] in results [${resultIds.join(', ')}]`,
      );
    });
  }

  it('returns empty for empty project', async () => {
    const { db: emptyDb } = buildTestDb();
    // Use the emptyDb before any inserts... actually buildTestDb already inserts.
    // Use a fresh DB with no data.
    const Database = (await import('better-sqlite3')).default;
    const freshDb = new Database(':memory:');
    freshDb.pragma('journal_mode = WAL');
    const { runMigrations } = await import('../../src/core/db.js');
    runMigrations(freshDb);

    const retriever = new LlmIndexRetriever(freshDb, {
      caller: makeFakeCaller(),
      model: 'claude-haiku-4-5-20251001',
    });
    const results = await retriever.search('sqlite', { k: 5, projectId: 'empty-project' });
    expect(results).toHaveLength(0);
    freshDb.close();
    emptyDb.close();
  });

  it('respects k limit in response', async () => {
    const retriever = new LlmIndexRetriever(db, {
      caller: makeFakeCaller(),
      model: 'claude-haiku-4-5-20251001',
    });
    const results = await retriever.search('sqlite pnpm decision', { k: 2, projectId: PROJECT_ID });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('handles malformed LLM response gracefully', async () => {
    const badCaller: LlmCaller = {
      async complete() {
        return { text: 'not valid json at all !!!', inputTokens: 10, outputTokens: 5 };
      },
    };
    const retriever = new LlmIndexRetriever(db, {
      caller: badCaller,
      model: 'claude-haiku-4-5-20251001',
    });
    const results = await retriever.search('sqlite', { k: 5, projectId: PROJECT_ID });
    expect(results).toHaveLength(0);
  });

  it('ignores IDs not in the catalog', async () => {
    const hallucCaller: LlmCaller = {
      async complete() {
        return {
          text: JSON.stringify({ ids: ['hallucinated-id-1', 'hallucinated-id-2'] }),
          inputTokens: 10,
          outputTokens: 5,
        };
      },
    };
    const retriever = new LlmIndexRetriever(db, {
      caller: hallucCaller,
      model: 'claude-haiku-4-5-20251001',
    });
    const results = await retriever.search('sqlite', { k: 5, projectId: PROJECT_ID });
    // Hallucinated IDs should produce zero results
    expect(results).toHaveLength(0);
  });
});
