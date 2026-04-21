// Writes individual per-observation markdown files as the human-readable mirror
// described in SPEC.md §5.2: memories/<YYYY-MM>/<ulid>.md
// SQLite is the source of truth; these files are derived and regenerated on import.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from './schema.js';

function isoMonth(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7); // "2026-04"
}

function frontmatter(obs: Observation): string {
  const lines: string[] = ['---'];
  lines.push(`id: ${obs.id}`);
  lines.push(`kind: ${obs.kind}`);
  lines.push(`created: ${new Date(obs.created_at).toISOString()}`);
  if (obs.files.length > 0) lines.push(`files: [${obs.files.map((f) => `"${f}"`).join(', ')}]`);
  if (obs.tags.length > 0) lines.push(`tags: [${obs.tags.map((t) => `"${t}"`).join(', ')}]`);
  lines.push(`tokens_saved: ${obs.tokens_saved}`);
  lines.push(`tokens_spent: ${obs.tokens_spent}`);
  lines.push('---');
  return lines.join('\n');
}

export function writeMemoryMarkdown(obs: Observation, memoriesDir: string): string {
  const month = isoMonth(obs.created_at);
  const monthDir = join(memoriesDir, month);
  if (!existsSync(monthDir)) mkdirSync(monthDir, { recursive: true });

  const filePath = join(monthDir, `${obs.id}.md`);
  const content = `${frontmatter(obs)}\n\n# ${obs.title}\n\n${obs.body}\n`;
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function memoriesDir(projectDir: string): string {
  return join(projectDir, 'memories');
}
