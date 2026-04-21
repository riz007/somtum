import { join } from 'node:path';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';

// Opens the observation body in $EDITOR. On save, writes the new body back
// to the DB. Title-editing is intentionally out of scope to keep the flow
// simple and the index consistent.
export async function editCommand(id: string, options: { cwd?: string } = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const projectId = resolveProjectId(cwd);
  const dbPath = join(projectDir(projectId), 'db.sqlite');

  if (!existsSync(dbPath)) {
    console.error('no somtum DB found — run `somtum init` first');
    return 1;
  }

  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    const obs = store.get(id);
    if (!obs) {
      console.error(`no observation with id ${id}`);
      return 1;
    }

    const editor = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';
    const tmpPath = join(tmpdir(), `somtum-edit-${id}.md`);

    // Write current body to temp file with a header comment so the user has context.
    const header = `<!-- somtum edit: ${obs.id} | kind: ${obs.kind} | title: ${obs.title} -->\n<!-- Save and exit to commit changes. Delete all content to abort. -->\n\n`;
    writeFileSync(tmpPath, header + obs.body, 'utf8');

    const result = spawnSync(editor, [tmpPath], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`editor exited with status ${result.status}`);
      unlinkSync(tmpPath);
      return 1;
    }

    const rawContent = readFileSync(tmpPath, 'utf8');
    unlinkSync(tmpPath);

    // Strip the header comment lines before saving.
    const newBody = rawContent
      .split('\n')
      .filter(
        (line) => !line.startsWith('<!-- somtum edit:') && !line.startsWith('<!-- Save and exit'),
      )
      .join('\n')
      .trim();

    if (newBody.length === 0) {
      console.log('empty body — edit aborted');
      return 0;
    }

    if (newBody === obs.body) {
      console.log('no changes');
      return 0;
    }

    db.prepare('UPDATE observations SET body = ? WHERE id = ?').run(newBody, id);
    console.log(`updated: ${id}`);
    return 0;
  } finally {
    db.close();
  }
}
