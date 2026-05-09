import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { suggestClaudeMdCommand } from './suggest_claude_md.js';

const PROJECT_ID = 'test-suggest-project';

let tmp: string;
let dbPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-suggest-'));
  dbPath = join(tmp, 'db.sqlite');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function seedObservations(): void {
  const db = openDb({ path: dbPath });
  const store = new MemoryStore(db);
  store.insert({
    project_id: PROJECT_ID,
    session_id: 's1',
    kind: 'decision',
    title: 'use TypeScript strict mode',
    body: 'Always enable strict: true in tsconfig. Prevents most runtime type errors.',
    files: [],
    tags: [],
  });
  store.insert({
    project_id: PROJECT_ID,
    session_id: 's1',
    kind: 'command',
    title: 'run tests with pnpm test',
    body: 'pnpm test runs vitest with coverage. Use --reporter=verbose for CI.',
    files: [],
    tags: [],
  });
  db.close();
}

describe('suggestClaudeMdCommand', () => {
  it('dry-run prints preview but does not write CLAUDE.md', async () => {
    seedObservations();
    const claudeMdPath = join(tmp, 'CLAUDE.md');
    const code = await suggestClaudeMdCommand({
      cwd: tmp,
      dry: true,
      yes: true,
      dbPath,
      projectId: PROJECT_ID,
    });
    expect(code).toBe(0);
    expect(existsSync(claudeMdPath)).toBe(false);
  });

  it('writes CLAUDE.md with observation titles when yes=true', async () => {
    seedObservations();
    const claudeMdPath = join(tmp, 'CLAUDE.md');
    const code = await suggestClaudeMdCommand({
      cwd: tmp,
      yes: true,
      dbPath,
      projectId: PROJECT_ID,
    });
    expect(code).toBe(0);
    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, 'utf8');
    expect(content).toContain('use TypeScript strict mode');
    expect(content).toContain('run tests with pnpm test');
  });

  it('returns 0 with message when no observations exist', async () => {
    // DB exists but is empty
    const db = openDb({ path: dbPath });
    db.close();
    const code = await suggestClaudeMdCommand({
      cwd: tmp,
      yes: true,
      dbPath,
      projectId: PROJECT_ID,
    });
    expect(code).toBe(0);
  });
});
