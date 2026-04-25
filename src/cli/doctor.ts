import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { openDb, hasFts5, appliedVersions } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { resolveProjectId } from '../core/project_id.js';
import { loadConfig, projectDir, GLOBAL_DIR, GLOBAL_CONFIG_PATH } from '../config.js';

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function runDoctor(opts: { cwd?: string } = {}): DoctorResult {
  const cwd = opts.cwd ?? process.cwd();
  const checks: DoctorCheck[] = [];

  // 1. Config loads without error
  let config;
  try {
    config = loadConfig({ cwd });
    checks.push({
      name: 'config',
      ok: true,
      detail: `strategy=${config.retrieval.strategy}, k=${config.retrieval.k}`,
    });
  } catch (err) {
    checks.push({
      name: 'config',
      ok: false,
      detail: `failed to parse config: ${(err as Error).message}`,
    });
    return { ok: false, checks };
  }

  // 2. Global directory exists
  checks.push({
    name: 'global_dir',
    ok: existsSync(GLOBAL_DIR),
    detail: GLOBAL_DIR,
  });

  // 3. Global config file (optional — defaults are fine if absent)
  checks.push({
    name: 'global_config',
    ok: true,
    detail: existsSync(GLOBAL_CONFIG_PATH) ? 'present' : 'absent (defaults apply)',
  });

  // 4. DB file accessible
  const projectId = resolveProjectId(cwd);
  const dbPath = join(projectDir(projectId), 'db.sqlite');
  const dbExists = existsSync(dbPath);
  checks.push({
    name: 'db_file',
    ok: dbExists,
    detail: dbExists ? dbPath : `not found at ${dbPath} — run \`somtum init\` first`,
  });

  if (!dbExists) {
    return { ok: false, checks };
  }

  // 5. DB opens & FTS5 available
  let db;
  try {
    db = openDb({ path: dbPath });
    checks.push({ name: 'db_open', ok: true, detail: 'WAL mode, foreign_keys ON' });
  } catch (err) {
    checks.push({ name: 'db_open', ok: false, detail: (err as Error).message });
    return { ok: false, checks };
  }

  try {
    const fts5 = hasFts5(db);
    checks.push({
      name: 'fts5',
      ok: fts5,
      detail: fts5 ? 'available' : 'NOT available — BM25 retrieval will not work',
    });

    // 6. All expected migrations applied
    const applied = appliedVersions(db);
    const expectedVersions = [1, 2, 3];
    const missing = expectedVersions.filter((v) => !applied.includes(v));
    checks.push({
      name: 'migrations',
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `applied: [${applied.join(', ')}]`
          : `missing migrations: [${missing.join(', ')}]`,
    });

    // 7. Memory count + tokens saved
    const store = new MemoryStore(db);
    const memCount = store.countByProject(projectId);
    const saved = store.totalTokensSaved(projectId);
    const spent = store.totalTokensSpent(projectId);
    checks.push({
      name: 'memories',
      ok: true,
      detail: `${memCount} memories, ${saved} tokens saved, ${spent} tokens spent`,
    });

    // 8. Breakeven ratio warning
    if (spent > 0) {
      const ratio = saved / spent;
      const ok = ratio >= 1.5;
      checks.push({
        name: 'breakeven_ratio',
        ok,
        detail: `${ratio.toFixed(2)}x${ok ? '' : ' — below 1.5x, extraction cost may exceed savings'}`,
      });
    } else {
      checks.push({ name: 'breakeven_ratio', ok: true, detail: 'n/a (no extraction cost yet)' });
    }

    // 9. Cache entries
    const cache = new PromptCache(db);
    const cacheCount = cache.count();
    checks.push({ name: 'cache_entries', ok: true, detail: `${cacheCount} entries` });

    // 10. Embeddings status
    checks.push({
      name: 'embeddings',
      ok: true,
      detail: config.retrieval.embeddings.enabled
        ? `enabled (model: ${config.retrieval.embeddings.model}) — run \`somtum reindex\` to embed missing`
        : 'disabled (set retrieval.embeddings.enabled=true to enable)',
    });

    // 11. Hook files in .claude/settings.json
    const settingsPath = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
        const hooks = (raw as Record<string, unknown>)['hooks'];
        const hasSessionEnd = hooks && JSON.stringify(hooks).includes('somtum');
        checks.push({
          name: 'hooks_installed',
          ok: Boolean(hasSessionEnd),
          detail: hasSessionEnd
            ? 'somtum hooks found in .claude/settings.json'
            : 'somtum hooks not found — run `somtum init`',
        });
      } catch {
        checks.push({
          name: 'hooks_installed',
          ok: false,
          detail: 'could not parse .claude/settings.json',
        });
      }
    } else {
      checks.push({
        name: 'hooks_installed',
        ok: false,
        detail: '.claude/settings.json not found — run `somtum init`',
      });
    }
  } finally {
    db.close();
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

export async function doctorCommand(
  options: { json?: boolean; cwd?: string } = {},
): Promise<number> {
  const result = runDoctor({ cwd: options.cwd ?? process.cwd() });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  for (const check of result.checks) {
    const icon = check.ok ? '✓' : '✗';
    console.log(`${icon}  ${check.name.padEnd(22)} ${check.detail}`);
  }
  if (!result.ok) {
    console.log('');
    console.log('somtum doctor found issues. Fix the items marked ✗ above.');
  }
  return result.ok ? 0 : 1;
}
