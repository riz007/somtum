import { readFileSync } from 'node:fs';

export interface Turn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  timestamp?: string;
  // Files the assistant touched during this turn (from Read/Edit/Write tool_use blocks).
  // Populated only for assistant turns; other roles always have an empty array.
  files_touched?: string[];
}

interface ClaudeCodeLine {
  type?: string;
  role?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  content?: unknown;
}

const FILE_TOOL_NAMES = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);

function extractFilesFromBlock(block: unknown): string[] {
  if (block == null || typeof block !== 'object') return [];
  const b = block as { type?: string; name?: string; input?: unknown };
  if (b.type !== 'tool_use' || b.name === undefined) return [];
  if (!FILE_TOOL_NAMES.has(b.name)) return [];
  const input = b.input as { file_path?: unknown; notebook_path?: unknown } | undefined;
  const p = input?.file_path ?? input?.notebook_path;
  return typeof p === 'string' && p.length > 0 ? [p] : [];
}

function coerceContent(content: unknown): { text: string; files: string[] } {
  if (typeof content === 'string') return { text: content, files: [] };
  if (Array.isArray(content)) {
    const files: string[] = [];
    const text = content
      .map((block) => {
        if (block == null) return '';
        if (typeof block === 'string') return block;
        if (
          typeof block === 'object' &&
          'text' in block &&
          typeof (block as { text: unknown }).text === 'string'
        ) {
          return (block as { text: string }).text;
        }
        if (
          typeof block === 'object' &&
          'type' in block &&
          (block as { type: string }).type === 'tool_use'
        ) {
          const b = block as { name?: string; input?: unknown };
          files.push(...extractFilesFromBlock(block));
          return `[tool_use ${b.name ?? ''} ${JSON.stringify(b.input ?? {})}]`;
        }
        if (
          typeof block === 'object' &&
          'type' in block &&
          (block as { type: string }).type === 'tool_result'
        ) {
          const b = block as { content?: unknown };
          return `[tool_result ${coerceContent(b.content).text}]`;
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
    return { text, files };
  }
  return { text: '', files: [] };
}

export function parseTranscript(raw: string): Turn[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const looksLikeJsonl =
    trimmed.includes('\n{') || (trimmed.startsWith('{') && trimmed.endsWith('}'));
  if (!looksLikeJsonl) {
    return [{ role: 'user', text: trimmed }];
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const turns: Turn[] = [];
  for (const line of lines) {
    let obj: ClaudeCodeLine;
    try {
      obj = JSON.parse(line) as ClaudeCodeLine;
    } catch {
      continue;
    }
    const role = (obj.message?.role ?? obj.role ?? obj.type ?? 'user') as Turn['role'];
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
    const content = obj.message?.content ?? obj.content;
    const { text, files } = coerceContent(content);
    if (text.length === 0) continue;
    const turn: Turn = { role, text };
    if (obj.timestamp) turn.timestamp = obj.timestamp;
    if (files.length > 0) turn.files_touched = files;
    turns.push(turn);
  }
  return turns;
}

export function parseTranscriptFile(path: string): Turn[] {
  return parseTranscript(readFileSync(path, 'utf8'));
}

export function renderTurns(turns: Turn[]): string {
  return turns.map((t) => `${t.role}: ${t.text}`).join('\n\n');
}

export interface PromptResponsePair {
  prompt: string;
  response: string;
  files_touched: string[];
}

// Extract user→assistant turn pairs for cache population. Only pairs where
// the user turn is immediately followed by one or more assistant turns are
// included. Assistant turns get concatenated so tool-heavy replies still
// attribute to the single user prompt that kicked them off.
export function extractPromptResponsePairs(turns: Turn[]): PromptResponsePair[] {
  const pairs: PromptResponsePair[] = [];
  for (let i = 0; i < turns.length; i += 1) {
    const t = turns[i];
    if (!t || t.role !== 'user') continue;
    const responses: string[] = [];
    const files = new Set<string>();
    let j = i + 1;
    while (j < turns.length) {
      const next = turns[j];
      if (!next) break;
      if (next.role === 'user') break;
      if (next.role === 'assistant') {
        responses.push(next.text);
        for (const f of next.files_touched ?? []) files.add(f);
      }
      j += 1;
    }
    if (responses.length > 0) {
      pairs.push({
        prompt: t.text,
        response: responses.join('\n\n'),
        files_touched: [...files],
      });
    }
  }
  return pairs;
}
