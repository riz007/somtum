import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { runImport } from './import.js';

let tmp: string;
let dbPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-import-'));
  dbPath = join(tmp, 'db.sqlite');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('runImport', () => {
  it('fills in project_id and session_id when records omit them', () => {
    const input = join(tmp, 'mem.jsonl');
    writeFileSync(
      input,
      [
        JSON.stringify({ kind: 'decision', title: 'Use pnpm', body: 'Workspaces need it.' }),
        JSON.stringify({
          kind: 'learning',
          title: 'Cookies for auth',
          body: 'httpOnly session cookie.',
        }),
      ].join('\n'),
    );
    const r = runImport({ input, dbPath, projectId: 'p1' });
    expect(r).toEqual({ imported: 2, skipped: 0, errors: [] });

    const db = openDb({ path: dbPath });
    const all = new MemoryStore(db).listByProject('p1');
    db.close();
    expect(all.map((o) => o.session_id)).toEqual(['import', 'import']);
  });

  it('reports a bad record as one readable line naming the record and field', () => {
    const input = join(tmp, 'mem.json');
    writeFileSync(
      input,
      JSON.stringify([
        { kind: 'decision', title: 'Fine', body: 'ok' },
        { kind: 'opinion', body: 'no title, unknown kind' },
      ]),
    );
    const r = runImport({ input, dbPath, projectId: 'p1' });
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^record 2: kind: .+; title: .+$/);
    expect(r.errors[0]).not.toContain('\n');
  });

  it('names the line of invalid JSONL', () => {
    const input = join(tmp, 'mem.jsonl');
    writeFileSync(input, '{"kind":"decision","title":"a","body":"b"}\n{not json\n');
    expect(() => runImport({ input, dbPath, projectId: 'p1' })).toThrow('line 2 is not valid JSON');
  });
});
