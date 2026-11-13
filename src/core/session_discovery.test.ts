import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPastSessions } from './session_discovery.js';

let root: string;
const saved = { claude: process.env['CLAUDE_CONFIG_DIR'], codex: process.env['CODEX_HOME'] };
const cwd = '/work/my.app';

const claudeLine = (branch: string) =>
  JSON.stringify({ type: 'user', gitBranch: branch, message: { role: 'user', content: 'hi' } });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'somtum-discovery-'));
  process.env['CLAUDE_CONFIG_DIR'] = join(root, 'claude');
  process.env['CODEX_HOME'] = join(root, 'codex');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const [k, v] of [
    ['CLAUDE_CONFIG_DIR', saved.claude],
    ['CODEX_HOME', saved.codex],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('findPastSessions', () => {
  it('finds Claude Code sessions for the project and its worktrees, newest first', () => {
    const projects = join(root, 'claude', 'projects');
    const main = join(projects, '-work-my-app');
    const worktree = join(projects, '-work-my-app--claude-worktrees-try-x');
    const other = join(projects, '-work-other');
    for (const d of [main, worktree, other]) mkdirSync(d, { recursive: true });
    writeFileSync(join(main, 'old.jsonl'), `${claudeLine('feature/a')}\n${claudeLine('main')}\n`);
    writeFileSync(join(worktree, 'new.jsonl'), `${claudeLine('HEAD')}\n`);
    writeFileSync(join(other, 'skip.jsonl'), `${claudeLine('main')}\n`);
    utimesSync(join(main, 'old.jsonl'), new Date(1_000_000), new Date(1_000_000));

    const found = findPastSessions(cwd, ['claude-code']);
    expect(found.map((s) => [s.sessionId, s.branch])).toEqual([
      ['new', null],
      ['old', 'main'],
    ]);
  });

  it('finds Codex sessions by their recorded working directory', () => {
    const day = join(root, 'codex', 'sessions', '2026', '11', '01');
    mkdirSync(day, { recursive: true });
    const meta = (id: string, dir: string) =>
      JSON.stringify({
        type: 'session_meta',
        payload: { id, cwd: dir, git: { branch: 'main', commit_hash: 'abc123' } },
      });
    writeFileSync(join(day, 'rollout-a.jsonl'), `${meta('in-project', `${cwd}/packages/api`)}\n`);
    writeFileSync(join(day, 'rollout-b.jsonl'), `${meta('elsewhere', '/work/my.app2')}\n`);

    const found = findPastSessions(cwd, ['codex']);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sessionId: 'in-project', branch: 'main', commit: 'abc123' });
  });
});
