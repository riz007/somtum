import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// project_id = sha256(git remote origin URL) for git repos, or sha256(cwd)
// otherwise. Stable across machines for the same repo.
export function resolveProjectId(cwd: string): string {
  const remote = tryGitRemote(cwd);
  const source = remote ?? cwd;
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function tryGitRemote(cwd: string): string | null {
  if (!existsSync(join(cwd, '.git'))) return null;
  try {
    const out = execFileSync('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function projectNameFromCwd(cwd: string): string {
  const parts = cwd.split(/[/\\]/).filter((p) => p.length > 0);
  return parts.at(-1) ?? 'project';
}
