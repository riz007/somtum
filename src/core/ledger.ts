import type { DB } from './db.js';

export type LedgerEvent =
  | 'extraction'
  | 'extraction_skipped'
  | 'file_summary'
  | 'injection'
  | 'file_gate_denied'
  | 'file_gate_summary'
  | 'file_gate_reread';

export interface LedgerCount {
  events: number;
  tokens: number;
}

export interface LedgerSummary {
  extraction: LedgerCount;
  extraction_skipped: LedgerCount;
  file_summary: LedgerCount;
  injection: LedgerCount;
  file_gate: {
    denied: LedgerCount;
    summary: LedgerCount;
    reread: LedgerCount;
    // Full-file tokens not read, minus summaries shown, minus files read anyway.
    net_tokens: number;
  };
  // Everything Somtum itself costs: extraction + file summaries + injected context.
  overhead_tokens: number;
}

const EMPTY: LedgerCount = { events: 0, tokens: 0 };

export class TokenLedger {
  constructor(private readonly db: DB) {}

  record(
    projectId: string,
    event: LedgerEvent,
    tokens: number,
    sessionId: string | null = null,
    now = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO token_ledger (project_id, session_id, event, tokens, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, sessionId, event, Math.max(0, Math.round(tokens)), now);
  }

  summary(projectId: string, opts: { since?: number } = {}): LedgerSummary {
    const rows = this.db
      .prepare(
        `SELECT event, COUNT(*) AS events, COALESCE(SUM(tokens), 0) AS tokens
         FROM token_ledger
         WHERE project_id = ? AND created_at >= ?
         GROUP BY event`,
      )
      .all(projectId, opts.since ?? 0) as Array<{ event: string; events: number; tokens: number }>;

    const by = new Map(rows.map((r) => [r.event, { events: r.events, tokens: r.tokens }]));
    const get = (e: LedgerEvent): LedgerCount => by.get(e) ?? EMPTY;

    const denied = get('file_gate_denied');
    const summary = get('file_gate_summary');
    const reread = get('file_gate_reread');
    const extraction = get('extraction');
    const fileSummary = get('file_summary');
    const injection = get('injection');

    return {
      extraction,
      extraction_skipped: get('extraction_skipped'),
      file_summary: fileSummary,
      injection,
      file_gate: {
        denied,
        summary,
        reread,
        net_tokens: denied.tokens - summary.tokens - reread.tokens,
      },
      overhead_tokens: extraction.tokens + fileSummary.tokens + injection.tokens,
    };
  }
}
