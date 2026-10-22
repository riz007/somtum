import type { Turn } from '../core/transcript.js';
import { truncateToolInput, truncateToolResult } from './shared.js';
import type { AgentAdapter } from './types.js';

interface ClaudeCodeLine {
  type?: string;
  role?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: {
    role?: string;
    content?: unknown;
  };
  content?: unknown;
}

const FILE_TOOL_NAMES = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);

// Claude Code transcripts deliver tool results as user-role messages whose
// content is tool_result blocks. Those are not real user prompts: treating
// them as such splits prompt→response pairs at every tool call and pollutes
// the cache. Detect them so they can be reclassified as role 'tool'.
function isToolResultContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  let sawToolResult = false;
  for (const block of content) {
    if (block == null || typeof block !== 'object') continue;
    const t = (block as { type?: string }).type;
    if (t === 'tool_result') sawToolResult = true;
    else if (t === 'text') return false;
  }
  return sawToolResult;
}

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
          return `[tool_use ${b.name ?? ''} ${truncateToolInput(JSON.stringify(b.input ?? {}))}]`;
        }
        if (
          typeof block === 'object' &&
          'type' in block &&
          (block as { type: string }).type === 'tool_result'
        ) {
          const b = block as { content?: unknown };
          return `[tool_result ${truncateToolResult(coerceContent(b.content).text)}]`;
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
    return { text, files };
  }
  return { text: '', files: [] };
}

function parse(raw: string): Turn[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const turns: Turn[] = [];
  for (const line of lines) {
    let obj: ClaudeCodeLine;
    try {
      obj = JSON.parse(line) as ClaudeCodeLine;
    } catch {
      continue;
    }
    // Meta lines (caveats, command wrappers) and sidechain (subagent) turns
    // are not part of the main conversation.
    if (obj.isMeta === true || obj.isSidechain === true) continue;
    let role = (obj.message?.role ?? obj.role ?? obj.type ?? 'user') as Turn['role'];
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
    const content = obj.message?.content ?? obj.content;
    if (role === 'user' && isToolResultContent(content)) role = 'tool';
    const { text, files } = coerceContent(content);
    if (text.length === 0) continue;
    const turn: Turn = { role, text };
    if (obj.timestamp) turn.timestamp = obj.timestamp;
    if (files.length > 0) turn.files_touched = files;
    turns.push(turn);
  }
  return turns;
}

// Claude Code is the fallback format: generic {role, content} JSONL parses
// correctly through it, so detect() accepts anything.
export const claudeCode: AgentAdapter = {
  id: 'claude-code',
  name: 'Claude Code',
  detect: () => true,
  parse,
};
