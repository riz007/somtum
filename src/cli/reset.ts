import { join } from 'node:path';
import { existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir, GLOBAL_DIR } from '../config.js';
import { createHash } from 'node:crypto';

function sessionFiles(projectId: string): string[] {
  const sessionDir = join(GLOBAL_DIR, 'session');
  const warmDir = join(GLOBAL_DIR, 'warmstart');
  const prefix = createHash('sha1').update(projectId).digest('hex').slice(0, 12);
  const found: string[] = [];
  for (const [dir, pattern] of [
    [sessionDir, `lh_${prefix}`],
    [warmDir, `ws_${prefix}`],
  ] as [string, string][]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(pattern)) found.push(join(dir, name));
    }
  }
  return found;
}

export async function resetCommand(opts: {
  cwd?: string;
  yes?: boolean;
  projectId?: string;
  dbPath?: string;
} = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dir = projectDir(projectId);
  const dbPath = opts.dbPath ?? join(dir, 'db.sqlite');
  const extras = sessionFiles(projectId);

  if (!existsSync(dbPath)) {
    console.log('somtum: nothing to reset — no database found for this project.');
    return 0;
  }

  console.log('The following will be permanently deleted:');
  console.log(`  ${dbPath}`);
  for (const f of extras) console.log(`  ${f}`);
  console.log('');

  if (!opts.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question('Permanently delete all memories for this project? [y/N] ');
      if (answer.trim().toLowerCase() !== 'y') {
        console.log('Aborted.');
        return 0;
      }
    } finally {
      rl.close();
    }
  }

  rmSync(dbPath, { force: true });
  for (const f of extras) {
    try {
      unlinkSync(f);
    } catch {
      /* non-fatal */
    }
  }

  console.log(`somtum: reset complete — project ${projectId} wiped.`);
  console.log('Run `somtum init` to reinstall hooks if needed.');
  return 0;
}
