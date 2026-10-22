import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Turn } from '../core/transcript.js';
import { truncateToolInput, truncateToolResult } from './shared.js';
import type { AgentAdapter } from './types.js';

// Codex rollout files (~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl):
// one {timestamp, type, payload} object per line. The conversation lives in
// `response_item` lines; `event_msg` lines repeat parts of it for the UI.
interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface ContentBlock {
  type?: string;
  text?: string;
}

// User-role blocks Codex injects itself: environment, AGENTS.md, permissions,
// app state. Most are one <snake_case> tag wrapping the whole block, and new
// ones keep appearing, so match that shape as well as the known prefixes.
const INJECTED_PREFIXES = ['# AGENTS.md instructions', '<permissions'];
const INJECTED_TAG_BLOCK = /^<([a-z]+(?:_[a-z]+)+)>[\s\S]*<\/\1>$/;

// IDE extensions wrap the prompt as "# Context from my IDE setup: ...
// ## My request for Codex:\n<prompt>". The heading text varies by version.
const IDE_CONTEXT_PREFIX = '# Context from my IDE setup';
const IDE_REQUEST_MARKER = /^## My request[^\n]*:\n/m;

const PATCH_FILE_LINE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

function userText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const text = b.text?.trim();
    if (!text) continue;
    if (INJECTED_PREFIXES.some((p) => text.startsWith(p))) continue;
    if (INJECTED_TAG_BLOCK.test(text)) continue;
    if (text.startsWith(IDE_CONTEXT_PREFIX)) {
      const m = IDE_REQUEST_MARKER.exec(text);
      if (m) parts.push(text.slice(m.index + m[0].length).trim());
      continue;
    }
    parts.push(text);
  }
  return parts.join('\n');
}

function assistantText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => b.text ?? '')
    .filter((t) => t.length > 0)
    .join('\n');
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function patchedFiles(patch: string): string[] {
  return [...patch.matchAll(PATCH_FILE_LINE)].map((m) => m[1]!.trim());
}

// Guardian reviews and other subagent threads get their own rollout file.
// They are Codex talking to itself, not the user's session.
function isSubagentSession(meta: Record<string, unknown>): boolean {
  const threadSource = meta['thread_source'];
  if (typeof threadSource === 'string' && threadSource !== 'user') return true;
  return typeof meta['source'] === 'object' && meta['source'] !== null;
}

function toTurn(line: RolloutLine): Turn | null {
  const p = line.payload ?? {};
  let turn: Turn | null = null;

  switch (p['type']) {
    case 'message': {
      const blocks = (Array.isArray(p['content']) ? p['content'] : []) as ContentBlock[];
      if (p['role'] === 'user') {
        const text = userText(blocks);
        if (text) turn = { role: 'user', text };
      } else if (p['role'] === 'assistant') {
        const text = assistantText(blocks);
        if (text) turn = { role: 'assistant', text };
      }
      break;
    }
    case 'function_call':
      turn = {
        role: 'assistant',
        text: `[tool_use ${asText(p['name'])} ${truncateToolInput(asText(p['arguments']))}]`,
      };
      break;
    case 'custom_tool_call': {
      const input = asText(p['input']);
      turn = {
        role: 'assistant',
        text: `[tool_use ${asText(p['name'])} ${truncateToolInput(input)}]`,
      };
      if (p['name'] === 'apply_patch') {
        const files = patchedFiles(input);
        if (files.length > 0) turn.files_touched = files;
      }
      break;
    }
    case 'function_call_output':
    case 'custom_tool_call_output':
      turn = { role: 'tool', text: `[tool_result ${truncateToolResult(asText(p['output']))}]` };
      break;
  }

  if (turn && line.timestamp) turn.timestamp = line.timestamp;
  return turn;
}

function parse(raw: string): Turn[] {
  const turns: Turn[] = [];
  for (const lineText of raw.split(/\r?\n/)) {
    if (lineText.trim().length === 0) continue;
    let line: RolloutLine;
    try {
      line = JSON.parse(lineText) as RolloutLine;
    } catch {
      continue;
    }
    if (line.type === 'session_meta' && isSubagentSession(line.payload ?? {})) return [];
    if (line.type !== 'response_item') continue;
    const turn = toTurn(line);
    if (turn) turns.push(turn);
  }
  return turns;
}

function detect(raw: string): boolean {
  const nl = raw.indexOf('\n');
  const firstLine = (nl === -1 ? raw : raw.slice(0, nl)).trim();
  try {
    const obj = JSON.parse(firstLine) as RolloutLine;
    return (
      (obj.type === 'session_meta' || obj.type === 'response_item') &&
      typeof obj.payload === 'object'
    );
  } catch {
    return false;
  }
}

function sessionsDir(): string {
  return join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'sessions');
}

// Codex hooks may send transcript_path: null. Rollout filenames end in the
// session id, so search the date folders newest-first.
function findTranscript(sessionId: string): string | null {
  const root = sessionsDir();
  if (!existsSync(root)) return null;
  const suffix = `${sessionId}.jsonl`;
  const newestFirst = (dir: string) => readdirSync(dir).sort().reverse();
  try {
    for (const y of newestFirst(root)) {
      for (const m of newestFirst(join(root, y))) {
        for (const d of newestFirst(join(root, y, m))) {
          const hit = readdirSync(join(root, y, m, d)).find((f) => f.endsWith(suffix));
          if (hit) return join(root, y, m, d, hit);
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const codex: AgentAdapter = {
  id: 'codex',
  name: 'Codex',
  detect,
  parse,
  findTranscript,
};
