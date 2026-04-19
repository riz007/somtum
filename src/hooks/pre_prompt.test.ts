import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../core/db.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { ConfigSchema } from '../core/schema.js';
import { runPrePrompt } from './pre_prompt.js';

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-pre-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function seed(prompt: string, response: string, files: string[]): void {
  const cache = new PromptCache(db);
  const { fingerprint } = fingerprintFiles(files, { cwd: tmp });
  cache.put({
    prompt_hash: hashPrompt(prompt),
    prompt_text: prompt,
    response,
    model: 'test-model',
    context_fingerprint: fingerprint,
    files_touched: files,
  });
}

describe('runPrePrompt', () => {
  it('returns no-hit when the prompt is not cached', async () => {
    const r = await runPrePrompt(
      { prompt: 'what is a cache', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('no-hit');
  });

  it('returns a hit with the cached response as additionalContext', async () => {
    writeFileSync(join(tmp, 'notes.md'), 'stable content');
    seed('explain fingerprinting', 'Fingerprints are sha256 of sorted (path,hash) pairs.', ['notes.md']);
    const r = await runPrePrompt(
      { prompt: 'explain fingerprinting', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(true);
    expect(r.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
    expect(r.hookSpecificOutput?.additionalContext).toContain('Fingerprints are sha256');
  });

  it('invalidates when a referenced file has changed', async () => {
    writeFileSync(join(tmp, 'notes.md'), 'original');
    seed('what does notes.md say', 'it says original', ['notes.md']);
    writeFileSync(join(tmp, 'notes.md'), 'mutated');
    const r = await runPrePrompt(
      { prompt: 'what does notes.md say', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('fingerprint-mismatch');

    // Subsequent calls should now miss the invalidated entry entirely.
    const r2 = await runPrePrompt(
      { prompt: 'what does notes.md say', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r2.reason).toBe('no-hit');
  });

  it('respects cache.enabled = false', async () => {
    seed('anything', 'anything', []);
    const config = ConfigSchema.parse({ cache: { enabled: false } });
    const r = await runPrePrompt({ prompt: 'anything', cwd: tmp }, { db, config, projectId: 'p1' });
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('cache-disabled');
  });

  it('treats an empty prompt as a miss', async () => {
    const r = await runPrePrompt(
      { prompt: '   ', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
  });
});
