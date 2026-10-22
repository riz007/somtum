import type { AgentAdapter, AgentId } from './types.js';
import { claudeCode } from './claude_code.js';
import { codex } from './codex.js';

export type { AgentAdapter, AgentId } from './types.js';
export { AGENT_IDS } from './types.js';

// Order matters: detect() runs in sequence and Claude Code accepts anything,
// so it must stay last.
const ADAPTERS: readonly AgentAdapter[] = [codex, claudeCode];

export function getAgent(id: AgentId): AgentAdapter {
  const agent = ADAPTERS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}

export function detectAgent(raw: string): AgentAdapter {
  return ADAPTERS.find((a) => a.detect(raw)) ?? claudeCode;
}

export function findTranscript(sessionId: string): string | null {
  for (const agent of ADAPTERS) {
    const path = agent.findTranscript?.(sessionId);
    if (path) return path;
  }
  return null;
}
