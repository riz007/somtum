import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';
import { ObservationInputSchema } from '../core/schema.js';

function parseJsonl(raw: string): unknown[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function runImport(opts: {
  input: string;
  format?: 'json' | 'jsonl';
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): ImportResult {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');

  if (!existsSync(opts.input)) {
    throw new Error(`input file not found: ${opts.input}`);
  }

  const raw = readFileSync(opts.input, 'utf8');
  const format = opts.format ?? (opts.input.endsWith('.jsonl') ? 'jsonl' : 'json');
  const items: unknown[] = format === 'jsonl' ? parseJsonl(raw) : (JSON.parse(raw) as unknown[]);

  const db = openDb({ path: dbPath });
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  try {
    const store = new MemoryStore(db);

    for (const item of items) {
      const parsed = ObservationInputSchema.safeParse(item);
      if (!parsed.success) {
        result.errors.push(parsed.error.message);
        result.skipped += 1;
        continue;
      }

      // Skip if ID already exists
      const existing = parsed.data.id ? store.get(parsed.data.id) : null;
      if (existing) {
        result.skipped += 1;
        continue;
      }

      try {
        // Force project_id to current project unless explicitly set
        const input = {
          ...parsed.data,
          project_id: parsed.data.project_id || projectId,
        };
        store.insert(input);
        result.imported += 1;
      } catch (err) {
        result.errors.push((err as Error).message);
        result.skipped += 1;
      }
    }
  } finally {
    db.close();
  }

  return result;
}

export function importCommand(
  input: string,
  options: { format?: string; json?: boolean; cwd?: string } = {},
): number {
  const fmt = options.format as 'json' | 'jsonl' | undefined;
  let result: ImportResult;
  try {
    const importOpts: Parameters<typeof runImport>[0] = {
      input,
      cwd: options.cwd ?? process.cwd(),
    };
    if (fmt !== undefined) importOpts.format = fmt;
    result = runImport(importOpts);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`imported: ${result.imported}, skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      for (const e of result.errors) console.error(`  error: ${e}`);
    }
  }
  return result.errors.length > 0 ? 1 : 0;
}
