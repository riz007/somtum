import { readFileSync } from 'node:fs';
import { detectAgent } from '../agents/index.js';

export interface Turn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  timestamp?: string;
  // Files the agent read or edited during this turn.
  // Populated only for assistant turns; other roles always have an empty array.
  files_touched?: string[];
}

export function parseTranscript(raw: string): Turn[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const looksLikeJsonl =
    trimmed.includes('\n{') || (trimmed.startsWith('{') && trimmed.endsWith('}'));
  if (!looksLikeJsonl) {
    return [{ role: 'user', text: trimmed }];
  }
  return detectAgent(trimmed).parse(trimmed);
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

// Synthetic user turns that must never become cache keys: slash-command
// wrappers, local command output, and interruption markers.
function isSyntheticPrompt(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith('<command-name>') ||
    t.startsWith('<local-command') ||
    t.startsWith('<system-reminder>') ||
    t.startsWith('[Request interrupted')
  );
}

// Extract user→assistant turn pairs for cache population. Only pairs where
// the user turn is immediately followed by one or more assistant turns are
// included. Assistant turns get concatenated so tool-heavy replies still
// attribute to the single user prompt that kicked them off. Tool turns
// (tool results) neither break a pair nor contribute to the response.
export function extractPromptResponsePairs(turns: Turn[]): PromptResponsePair[] {
  const pairs: PromptResponsePair[] = [];
  for (let i = 0; i < turns.length; i += 1) {
    const t = turns[i];
    if (!t || t.role !== 'user' || isSyntheticPrompt(t.text)) continue;
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
