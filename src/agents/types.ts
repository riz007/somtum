import type { Turn } from '../core/transcript.js';

export type AgentId = 'claude-code' | 'codex';

export const AGENT_IDS: readonly AgentId[] = ['claude-code', 'codex'];

export interface AgentAdapter {
  id: AgentId;
  name: string;
  // Cheap sniff of a raw JSONL transcript: does this agent's format match?
  detect(raw: string): boolean;
  parse(raw: string): Turn[];
  // Locate a session's transcript when the hook payload has no usable path.
  findTranscript?(sessionId: string): string | null;
}
