import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BranchView, captureGit } from './git_context.js';

let root: string;
let repo: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

function commit(cwd: string, file: string): void {
  writeFileSync(join(cwd, file), file);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
}

const visible = (cwd: string, branch: string | null, beforeFirstCommit = false) =>
  BranchView.load(cwd)!.isVisible({
    git_branch: branch,
    git_before_first_commit: beforeFirstCommit,
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'somtum-git-'));
  repo = join(root, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  commit(repo, 'a.txt');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('captureGit', () => {
  it('records branch, commit and the default branch', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/x');
    const c = captureGit(repo);
    expect(c.branch).toBe('feature/x');
    expect(c.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(c.defaultBranch).toBe('main');
  });

  it('returns nulls outside a repository', () => {
    expect(captureGit(root)).toEqual({
      branch: null,
      commit: null,
      defaultBranch: null,
      beforeFirstCommit: false,
    });
  });

  it('records the branch before the first commit', () => {
    const fresh = join(root, 'fresh');
    execFileSync('git', ['init', '-q', '-b', 'main', fresh]);
    expect(captureGit(fresh)).toMatchObject({ branch: 'main', commit: null });
  });
});

describe('BranchView', () => {
  it('is null outside a repository', () => {
    expect(BranchView.load(root)).toBeNull();
  });

  it('shows memories without a branch, from the current branch, and from main', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/x');
    expect(visible(repo, null)).toBe(true);
    expect(visible(repo, 'feature/x')).toBe(true);
    expect(visible(repo, 'main')).toBe(true);
  });

  it('hides a parallel branch that exists and is not merged', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/redux');
    commit(repo, 'redux.txt');
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'checkout', '-q', '-b', 'feature/zustand');
    commit(repo, 'zustand.txt');
    expect(visible(repo, 'feature/redux')).toBe(false);
  });

  it("keeps memories from before a branch's first commit with that branch until it is deleted", () => {
    git(repo, 'checkout', '-q', '-b', 'experiment');
    expect(captureGit(repo).beforeFirstCommit).toBe(true);
    git(repo, 'checkout', '-q', 'main');
    commit(repo, 'b.txt');
    // Git reports experiment as merged into main: its tip is an ancestor.
    expect(visible(repo, 'experiment', true)).toBe(false);
    git(repo, 'branch', '-q', '-D', 'experiment');
    expect(visible(repo, 'experiment', true)).toBe(true);
  });

  it('does not flag a branch that already has commits', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/x');
    commit(repo, 'x.txt');
    expect(captureGit(repo).beforeFirstCommit).toBe(false);
  });

  it('shows a branch once it is merged', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/zustand');
    commit(repo, 'zustand.txt');
    git(repo, 'checkout', '-q', 'main');
    expect(visible(repo, 'feature/zustand')).toBe(false);
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'feature/zustand');
    expect(visible(repo, 'feature/zustand')).toBe(true);
  });

  it('shows a deleted branch (merged elsewhere, e.g. a squash-merged PR)', () => {
    git(repo, 'checkout', '-q', '-b', 'feature/squashed');
    commit(repo, 's.txt');
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'branch', '-q', '-D', 'feature/squashed');
    expect(visible(repo, 'feature/squashed')).toBe(true);
  });

  it('shows a branch whose upstream was deleted after its pull request merged', () => {
    const remote = join(root, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', remote]);
    git(repo, 'remote', 'add', 'origin', remote);
    git(repo, 'push', '-q', '-u', 'origin', 'main');
    git(repo, 'checkout', '-q', '-b', 'feature/pr');
    commit(repo, 'pr.txt');
    git(repo, 'push', '-q', '-u', 'origin', 'feature/pr');
    git(repo, 'checkout', '-q', 'main');
    expect(visible(repo, 'feature/pr')).toBe(false);

    git(repo, 'push', '-q', 'origin', '--delete', 'feature/pr');
    git(repo, 'fetch', '-q', '--prune');
    expect(visible(repo, 'feature/pr')).toBe(true);
  });
});
