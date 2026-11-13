import { execFileSync } from 'node:child_process';

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trimEnd();
  } catch {
    return null;
  }
}

function lines(out: string | null): string[] {
  return (out ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function findDefaultBranch(cwd: string, localBranches: Set<string>): string | null {
  const remoteHead = git(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remoteHead) return remoteHead.replace(/^origin\//, '');
  for (const name of ['main', 'master', 'trunk']) {
    if (localBranches.has(name)) return name;
  }
  return null;
}

export interface GitCapture {
  // null when detached, outside a repository, or git is unavailable.
  branch: string | null;
  // null before the first commit.
  commit: string | null;
  defaultBranch: string | null;
  // True on a non-default branch that has no commits of its own yet.
  beforeFirstCommit: boolean;
}

export function captureGit(cwd: string): GitCapture {
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (branch === null && git(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return { branch: null, commit: null, defaultBranch: null, beforeFirstCommit: false };
  }
  const commit = git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const local = new Set(
    lines(git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])),
  );
  const defaultBranch = findDefaultBranch(cwd, local);
  const ownCommits =
    branch && defaultBranch && branch !== defaultBranch && commit
      ? git(cwd, ['rev-list', '--count', `${defaultBranch}..HEAD`])
      : null;
  return { branch, commit, defaultBranch, beforeFirstCommit: ownCommits === '0' };
}

// Decides which memories belong in the current branch's context.
//
// A memory captured on branch B is recalled on the current branch when B is
// the current branch, B is the default branch, B has been merged into HEAD,
// or B no longer exists (deleted locally, or its upstream is gone: the usual
// state after a merged pull request, including squash merges). Only memories
// from a branch that still exists and hasn't been merged are hidden, and
// memories captured before B had a commit of its own stay hidden until B is
// deleted, since git reports such a branch as merged from the start.
export class BranchView {
  private constructor(
    readonly current: string | null,
    readonly defaultBranch: string | null,
    private readonly alive: Set<string>,
    private readonly merged: Set<string>,
  ) {}

  // Two git calls: this runs on every prompt that has branch-tagged memories.
  static load(cwd: string): BranchView | null {
    const refs = git(cwd, [
      'for-each-ref',
      '--format=%(HEAD)\t%(refname)\t%(upstream:track)\t%(symref)',
      'refs/heads',
      'refs/remotes/origin/HEAD',
    ]);
    if (refs === null) return null;
    let current: string | null = null;
    let remoteDefault: string | null = null;
    const local = new Set<string>();
    const alive = new Set<string>();
    // Not trimmed: %(HEAD) is a space for every branch but the current one.
    for (const line of refs.split('\n').filter((l) => l.length > 0)) {
      const [head = '', ref = '', track = '', symref = ''] = line.split('\t');
      if (ref === 'refs/remotes/origin/HEAD') {
        remoteDefault = symref.replace(/^refs\/remotes\/origin\//, '') || null;
        continue;
      }
      const name = ref.replace(/^refs\/heads\//, '');
      local.add(name);
      if (head === '*') current = name;
      if (!track.includes('gone')) alive.add(name);
    }
    const merged = new Set(
      lines(
        git(cwd, ['for-each-ref', '--merged', 'HEAD', '--format=%(refname:short)', 'refs/heads']),
      ),
    );
    const fallbackDefault = ['main', 'master', 'trunk'].find((n) => local.has(n)) ?? null;
    return new BranchView(current, remoteDefault ?? fallbackDefault, alive, merged);
  }

  isVisible(memory: { git_branch: string | null; git_before_first_commit?: boolean }): boolean {
    const b = memory.git_branch;
    if (!b) return true;
    if (b === this.current || b === this.defaultBranch) return true;
    if (!this.alive.has(b)) return true;
    if (memory.git_before_first_commit) return false;
    return this.merged.has(b);
  }
}
