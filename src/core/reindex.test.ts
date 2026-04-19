import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from './db.js';
import { MemoryStore } from './store.js';
import { EMBEDDING_DIM, setEmbedder } from './embeddings.js';
import { embedMissing } from './reindex.js';

function installTestEmbedder(): void {
  setEmbedder({
    name: 'test',
    dim: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((_, i) => {
        const v = new Float32Array(EMBEDDING_DIM);
        v[i % EMBEDDING_DIM] = 1;
        return v;
      });
    },
  });
}

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-reindex-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  installTestEmbedder();
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
  setEmbedder(null);
});

describe('embedMissing', () => {
  it('embeds every observation missing a vector and is idempotent', async () => {
    const store = new MemoryStore(db);
    for (let i = 0; i < 3; i += 1) {
      store.insert({
        project_id: 'p1',
        session_id: 's',
        kind: 'other',
        title: `t${i}`,
        body: `b${i}`,
      });
    }
    const first = await embedMissing(db, 'p1');
    expect(first.embedded).toBe(3);
    expect(first.failed).toBe(0);

    // Second run should find nothing to do.
    const second = await embedMissing(db, 'p1');
    expect(second.embedded).toBe(0);
  });
});
