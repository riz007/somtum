import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';
import type { Observation } from '../core/schema.js';

export type ExportFormat = 'json' | 'jsonl' | 'markdown';

function serializeObs(obs: Observation): Record<string, unknown> {
  const { embedding, ...rest } = obs;
  return { ...rest, embedding_bytes: embedding ? embedding.length : null };
}

function toMarkdown(obs: Observation): string {
  const lines: string[] = [];
  lines.push(`# ${obs.title}`);
  lines.push('');
  lines.push(`**id:** ${obs.id}  `);
  lines.push(`**kind:** ${obs.kind}  `);
  lines.push(`**created:** ${new Date(obs.created_at).toISOString()}  `);
  if (obs.files.length > 0) lines.push(`**files:** ${obs.files.join(', ')}  `);
  if (obs.tags.length > 0) lines.push(`**tags:** ${obs.tags.join(', ')}  `);
  lines.push('');
  lines.push(obs.body);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

export function runExport(opts: {
  format?: ExportFormat;
  output?: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
  includeDeleted?: boolean;
}): { observations: number; output: string | null } {
  const cwd = opts.cwd ?? process.cwd();
  const format = opts.format ?? 'json';
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');

  const db = openDb({ path: dbPath });
  let content: string;
  let count: number;

  try {
    const store = new MemoryStore(db);
    const listOpts = opts.includeDeleted !== undefined ? { includeDeleted: opts.includeDeleted } : {};
    const observations = store.listByProject(projectId, listOpts);
    count = observations.length;

    if (format === 'jsonl') {
      content = observations.map((o) => JSON.stringify(serializeObs(o))).join('\n') + '\n';
    } else if (format === 'markdown') {
      content = observations.map(toMarkdown).join('');
    } else {
      content = JSON.stringify(observations.map(serializeObs), null, 2) + '\n';
    }
  } finally {
    db.close();
  }

  if (opts.output) {
    writeFileSync(opts.output, content, 'utf8');
    return { observations: count, output: opts.output };
  } else {
    process.stdout.write(content);
    return { observations: count, output: null };
  }
}

export function exportCommand(options: {
  format?: string;
  output?: string;
  includeDeleted?: boolean;
  cwd?: string;
} = {}): number {
  const fmt = (options.format ?? 'json') as ExportFormat;
  if (!['json', 'jsonl', 'markdown'].includes(fmt)) {
    console.error(`unknown format: ${fmt}. Use json, jsonl, or markdown.`);
    return 1;
  }
  const exportOpts: Parameters<typeof runExport>[0] = {
    format: fmt,
    cwd: options.cwd ?? process.cwd(),
  };
  if (options.output !== undefined) exportOpts.output = options.output;
  if (options.includeDeleted !== undefined) exportOpts.includeDeleted = options.includeDeleted;
  const result = runExport(exportOpts);
  if (options.output) {
    console.error(`exported ${result.observations} observations to ${result.output}`);
  }
  return 0;
}
