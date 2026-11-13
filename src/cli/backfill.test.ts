import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { ConfigSchema } from '../core/schema.js';
import { SessionProgressStore } from '../core/session_progress.js';
import { readTranscript } from '../hooks/post_session.js';
import { planBackfill } from './backfill.js';

let root: string;
const saved = process.env['CLAUDE_CONFIG_DIR'];
const cwd = '/work/backfill-app';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'somtum-backfill-'));
  process.env['CLAUDE_CONFIG_DIR'] = join(root, 'claude');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (saved === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
  else process.env['CLAUDE_CONFIG_DIR'] = saved;
});

describe('planBackfill', () => {
  it('estimates past sessions and skips ones already extracted', () => {
    const dir = join(root, 'claude', 'projects', '-work-backfill-app');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'sess-1.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({
          type: 'user',
          gitBranch: 'main',
          message: { role: 'user', content: 'Use pnpm, not npm.' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Switched to pnpm.' }] },
        }),
      ].join('\n'),
    );
    const config = ConfigSchema.parse({ extraction: { min_new_tokens: 0 } });
    const dbPath = join(root, 'db.sqlite');

    const first = planBackfill({ cwd, config, limit: 5, agents: ['claude-code'], dbPath });
    expect(first).toHaveLength(1);
    expect(first[0]?.skip).toBeNull();
    expect(first[0]?.tokens).toBeGreaterThan(0);

    const db = openDb({ path: dbPath });
    new SessionProgressStore(db).markExtracted(
      'sess-1',
      'p',
      readTranscript(readFileSync(path, 'utf8')).turns,
    );
    db.close();

    const second = planBackfill({ cwd, config, limit: 5, agents: ['claude-code'], dbPath });
    expect(second[0]?.skip).toBe('already-extracted');
  });
});
