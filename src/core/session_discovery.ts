import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentId } from '../agents/types.js';

export interface PastSession {
  agent: AgentId;
  path: string;
  sessionId: string;
  mtime: number;
  bytes: number;
  // The branch the session ran on, read from the transcript itself.
  branch: string | null;
  commit: string | null;
}

function readSlice(path: string, from: 'start' | 'end', bytes: number): string {
  const fd = openSync(path, 'r');
  try {
    const size = statSync(path).size;
    const length = Math.min(bytes, size);
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, from === 'start' ? 0 : size - length);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

// Claude Code names a project's transcript folder after its path with every
// non-alphanumeric character replaced by "-". Worktrees of the project live
// under <project>/.claude/worktrees/<name>, which becomes "<slug>--claude-worktrees-<name>".
function claudeSessions(cwd: string): PastSession[] {
  const root = join(process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), 'projects');
  if (!existsSync(root)) return [];
  const slug = cwd.replace(/[^A-Za-z0-9]/g, '-');
  const out: PastSession[] = [];
  for (const dir of readdirSync(root)) {
    if (dir !== slug && !dir.startsWith(`${slug}--claude-worktrees-`)) continue;
    for (const file of readdirSync(join(root, dir))) {
      if (!file.endsWith('.jsonl')) continue;
      const path = join(root, dir, file);
      const st = statSync(path);
      if (!st.isFile()) continue;
      // The branch can change mid-session; the one it ended on is the one
      // the extracted decisions describe.
      let branch: string | null = null;
      for (const line of readSlice(path, 'end', 64 * 1024)
        .split('\n')
        .reverse()) {
        const m = /"gitBranch":"([^"]*)"/.exec(line);
        if (m) {
          // "HEAD" means detached: no branch to attribute the session to.
          branch = m[1] && m[1] !== 'HEAD' ? m[1] : null;
          break;
        }
      }
      out.push({
        agent: 'claude-code',
        path,
        sessionId: file.slice(0, -'.jsonl'.length),
        mtime: st.mtimeMs,
        bytes: st.size,
        branch,
        commit: null,
      });
    }
  }
  return out;
}

interface CodexMeta {
  type?: string;
  payload?: { id?: string; cwd?: string; git?: { branch?: string; commit_hash?: string } };
}

function codexSessions(cwd: string): PastSession[] {
  const root = join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'sessions');
  if (!existsSync(root)) return [];
  const out: PastSession[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.jsonl')) continue;
      let meta: CodexMeta;
      try {
        meta = JSON.parse(readSlice(path, 'start', 64 * 1024).split('\n')[0] ?? '') as CodexMeta;
      } catch {
        continue;
      }
      const p = meta.payload;
      if (meta.type !== 'session_meta' || !p?.id || !p.cwd) continue;
      if (p.cwd !== cwd && !p.cwd.startsWith(`${cwd}/`)) continue;
      const st = statSync(path);
      out.push({
        agent: 'codex',
        path,
        sessionId: p.id,
        mtime: st.mtimeMs,
        bytes: st.size,
        branch: p.git?.branch ?? null,
        commit: p.git?.commit_hash ?? null,
      });
    }
  };
  walk(root);
  return out;
}

// Past Claude Code and Codex sessions for this project, newest first.
export function findPastSessions(cwd: string, agents: readonly AgentId[]): PastSession[] {
  const found = [
    ...(agents.includes('claude-code') ? claudeSessions(cwd) : []),
    ...(agents.includes('codex') ? codexSessions(cwd) : []),
  ];
  return found.sort((a, b) => b.mtime - a.mtime);
}
