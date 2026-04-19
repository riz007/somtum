import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { DB } from './db.js';
import type { LlmCaller } from './extractor.js';
import { countTokens } from './tokens.js';
import { type FileFingerprint, FileFingerprintSchema } from './schema.js';

export interface FileSummaryRow extends FileFingerprint {
  // Same shape — exported as an alias for callers that only care about the
  // summary subset.
}

export class FileFingerprintStore {
  constructor(private readonly db: DB) {}

  get(projectId: string, path: string): FileFingerprint | null {
    const row = this.db
      .prepare(`SELECT * FROM file_fingerprints WHERE project_id = ? AND path = ?`)
      .get(projectId, path) as Record<string, unknown> | undefined;
    if (!row) return null;
    return FileFingerprintSchema.parse({
      project_id: row['project_id'],
      path: row['path'],
      content_hash: row['content_hash'],
      mtime: row['mtime'],
      tokens: row['tokens'],
      summary: row['summary'] ?? null,
      summary_hash: row['summary_hash'] ?? null,
    });
  }

  upsert(input: FileFingerprint): void {
    this.db
      .prepare(
        `INSERT INTO file_fingerprints
           (project_id, path, content_hash, mtime, tokens, summary, summary_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, path) DO UPDATE SET
           content_hash = excluded.content_hash,
           mtime = excluded.mtime,
           tokens = excluded.tokens,
           summary = COALESCE(excluded.summary, file_fingerprints.summary),
           summary_hash = COALESCE(excluded.summary_hash, file_fingerprints.summary_hash)`,
      )
      .run(
        input.project_id,
        input.path,
        input.content_hash,
        input.mtime,
        input.tokens,
        input.summary,
        input.summary_hash,
      );
  }
}

export interface FileStat {
  contentHash: string;
  mtime: number;
  tokens: number;
  bytes: number;
}

export function statFile(path: string, opts: { cwd: string }): FileStat | null {
  const abs = isAbsolute(path) ? path : resolve(opts.cwd, path);
  if (!existsSync(abs)) return null;
  let buf: Buffer;
  let mtime: number;
  try {
    buf = readFileSync(abs);
    mtime = Math.floor(statSync(abs).mtimeMs);
  } catch {
    return null;
  }
  const text = buf.toString('utf8');
  return {
    contentHash: createHash('sha256').update(buf).digest('hex'),
    mtime,
    tokens: countTokens(text),
    bytes: buf.length,
  };
}

// Minimal glob → RegExp. Supports `*`, `**`, and `?`. Sufficient for the
// tiny `exclude_globs` patterns we expect (e.g. `**/*.env`, `**/secrets/**`).
// For richer patterns we'd pull in `picomatch`, but that's overkill here.
function globToRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c && /[.+^${}()|[\]\\]/.test(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesAnyGlob(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegex(g).test(path));
}

const SUMMARY_SYSTEM = `You are Somtum's file summarizer. Produce a dense summary of a source file so a coding agent can decide whether it needs to read the full content.

INCLUDE:
- The file's purpose in 1-2 sentences
- Top-level exports/symbols and what each does
- Important invariants, side effects, or non-obvious constraints
- Cross-file dependencies worth knowing

OMIT:
- Line-by-line restatement of code
- Imports list
- Boilerplate, comments, or formatting

Return plain text. Aim for under 400 tokens. No markdown headers.`;

export interface SummarizeOptions {
  model: string;
  caller: LlmCaller;
  maxBytes?: number;
}

export interface SummaryOutcome {
  summary: string;
  tokensSpent: number;
}

const DEFAULT_MAX_BYTES = 200_000; // ~50k tokens worth of source — enough for any sane file.

export async function summarizeFile(
  path: string,
  contents: string,
  opts: SummarizeOptions,
): Promise<SummaryOutcome> {
  // Truncate pathologically large files so we don't blow the LLM context.
  const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const body =
    contents.length > max
      ? `${contents.slice(0, max)}\n\n[... file truncated at ${max} bytes for summarization ...]`
      : contents;

  const { text, inputTokens, outputTokens } = await opts.caller.complete({
    model: opts.model,
    system: SUMMARY_SYSTEM,
    user: `File: ${path}\n\n${body}`,
  });
  return {
    summary: text.trim(),
    tokensSpent: inputTokens + outputTokens,
  };
}

export function summaryHash(summary: string): string {
  return createHash('sha256').update(summary).digest('hex');
}
