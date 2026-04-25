// SSH-based push/pull sync (M6). Transfers observations as JSONL so we can
// merge rather than overwrite. Conflict rule: if the same ULID already exists
// locally the remote copy is skipped (ULIDs are unique across machines).
// Relies on `scp` being available in PATH.
import { execFileSync, execSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { openDb } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import { loadConfig, projectDir } from '../config.js';
import { runExport } from './export.js';
import { runImport } from './import.js';

// Parses "user@host:/remote/path" or "host:/remote/path"
function parseRemote(remote: string): { userHost: string; path: string } {
  const colonIdx = remote.indexOf(':');
  if (colonIdx === -1)
    throw new Error(`invalid sync.remote: "${remote}". Expected user@host:/path`);
  return { userHost: remote.slice(0, colonIdx), path: remote.slice(colonIdx + 1) };
}

function scpTo(localPath: string, remote: string): void {
  execFileSync('scp', ['-q', localPath, remote], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function scpFrom(remote: string, localPath: string): void {
  execFileSync('scp', ['-q', remote, localPath], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function remoteList(userHost: string, remotePath: string): string[] {
  try {
    const out = execSync(
      `ssh -o BatchMode=yes -o ConnectTimeout=5 ${userHost} "ls '${remotePath}'/observations.*.jsonl 2>/dev/null"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out
      .trim()
      .split('\n')
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

function remoteLineCount(userHost: string, remotePaths: string[]): number {
  if (remotePaths.length === 0) return 0;
  try {
    const paths = remotePaths.map((p) => `'${p}'`).join(' ');
    const out = execSync(
      `ssh -o BatchMode=yes -o ConnectTimeout=5 ${userHost} "wc -l ${paths} 2>/dev/null | tail -n 1"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const match = out.trim().match(/^(\d+)/);
    return match && match[1] ? Number.parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

export interface SyncResult {
  direction: 'push' | 'pull' | 'status';
  local_count: number;
  remote_count: number | null;
  transferred: number;
  remote: string;
}

export async function runSync(opts: {
  direction: 'push' | 'pull' | 'status';
  cwd?: string;
  remote?: string;
}): Promise<SyncResult> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const projectId = resolveProjectId(cwd);
  const dbPath = join(projectDir(projectId), 'db.sqlite');

  const remote = opts.remote ?? config.sync.remote;
  if (!remote) {
    throw new Error(
      'sync.remote is not configured. Set it via `somtum config set sync.remote "user@host:/path/.somtum/projects/<id>"`',
    );
  }

  const { userHost, path: remotePath } = parseRemote(remote);
  const host = hostname()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
  const remoteJsonl = `${remotePath}/observations.${host}.jsonl`;
  const localJsonl = join(projectDir(projectId), `observations.${host}.jsonl`);

  const db = openDb({ path: dbPath });
  let localCount: number;
  try {
    const { MemoryStore } = await import('../core/store.js');
    localCount = new MemoryStore(db).countByProject(projectId);
  } finally {
    db.close();
  }

  if (opts.direction === 'status') {
    const files = remoteList(userHost, remotePath);
    const count = remoteLineCount(userHost, files);
    return {
      direction: 'status',
      local_count: localCount,
      remote_count: count,
      transferred: 0,
      remote,
    };
  }

  if (opts.direction === 'push') {
    // Export local observations to JSONL then scp to remote.
    runExport({ format: 'jsonl', output: localJsonl, cwd });
    try {
      // Ensure remote directory exists via SSH mkdir.
      execSync(`ssh -o BatchMode=yes ${userHost} "mkdir -p '${remotePath}'"`, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      scpTo(localJsonl, `${userHost}:${remoteJsonl}`);
    } finally {
      if (existsSync(localJsonl)) unlinkSync(localJsonl);
    }
    return {
      direction: 'push',
      local_count: localCount,
      remote_count: localCount,
      transferred: localCount,
      remote,
    };
  }

  // pull: copy ALL remote JSONL files locally and merge.
  const files = remoteList(userHost, remotePath);
  let importedTotal = 0;
  let skippedTotal = 0;

  for (const remoteFile of files) {
    const base = remoteFile.split('/').pop()!;
    const tmpPath = join(tmpdir(), `somtum-pull-${projectId}-${base}`);
    try {
      scpFrom(`${userHost}:${remoteFile}`, tmpPath);
      const importResult = runImport({ input: tmpPath, format: 'jsonl', cwd });
      importedTotal += importResult.imported;
      skippedTotal += importResult.skipped;
    } finally {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    }
  }

  return {
    direction: 'pull',
    local_count: localCount + importedTotal,
    remote_count: localCount + importedTotal + skippedTotal,
    transferred: importedTotal,
    remote,
  };
}

export async function syncCommand(
  direction: 'push' | 'pull' | 'status',
  options: { remote?: string; json?: boolean; cwd?: string } = {},
): Promise<number> {
  let result: SyncResult;
  try {
    const syncOpts: Parameters<typeof runSync>[0] = {
      direction,
      cwd: options.cwd ?? process.cwd(),
    };
    if (options.remote !== undefined) syncOpts.remote = options.remote;
    result = await runSync(syncOpts);
  } catch (err) {
    console.error(`sync error: ${(err as Error).message}`);
    return 1;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (direction === 'status') {
    console.log(`local   ${result.local_count} observations`);
    const remoteStr = result.remote_count !== null ? String(result.remote_count) : 'unreachable';
    console.log(`remote  ${remoteStr} observation lines`);
    console.log(`remote  ${result.remote}`);
  } else if (direction === 'push') {
    console.log(`pushed ${result.transferred} observations to ${result.remote}`);
  } else {
    console.log(`pulled ${result.transferred} new observations from ${result.remote}`);
  }
  return 0;
}
