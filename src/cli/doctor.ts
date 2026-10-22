import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { openDb, hasFts5, appliedVersions } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { resolveProjectId } from '../core/project_id.js';
import { pickBackend } from '../core/llm_backend.js';
import { loadConfig, projectDir, GLOBAL_DIR, GLOBAL_CONFIG_PATH } from '../config.js';

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  /** Actionable fix instructions shown only when ok=false. */
  fix?: string[];
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
    ...(dbExists ? {} : { fix: ['somtum init'] }),
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
    const expectedVersions = [1, 2, 3, 4];
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
        ...(ok
          ? {}
          : {
              fix: [
                'somtum config set retrieval.strategy bm25   # match what is actually running',
                '# or, to enable real hybrid retrieval:',
                'somtum config set retrieval.embeddings.enabled true && somtum reindex',
                '# or reduce injection overhead:',
                'somtum config set injection.k 2',
              ],
            }),
      });
    } else {
      checks.push({ name: 'breakeven_ratio', ok: true, detail: 'n/a (no extraction cost yet)' });
    }

    // 9. Stale memories: older than 90 days, never confirmed via retrieval
    const staleCount = store.countStale(projectId, 90);
    checks.push({
      name: 'stale_memories',
      ok: staleCount === 0,
      detail:
        staleCount === 0
          ? 'no stale memories detected'
          : `${staleCount} memor${staleCount === 1 ? 'y' : 'ies'} older than 90 days with no retrieval — consider \`somtum purge\` or reviewing with \`somtum search\``,
      ...(staleCount === 0
        ? {}
        : {
            fix: [
              'somtum purge --older-than 90d --dry-run   # preview what would be removed',
              'somtum purge --older-than 90d             # remove stale memories',
            ],
          }),
    });

    // 10. Cache entries
    const cache = new PromptCache(db);
    const cacheCount = cache.count();
    checks.push({ name: 'cache_entries', ok: true, detail: `${cacheCount} entries` });

    // 11. Embeddings status
    checks.push({
      name: 'embeddings',
      ok: true,
      detail: config.retrieval.embeddings.enabled
        ? `enabled (model: ${config.retrieval.embeddings.model}) — run \`somtum reindex\` to embed missing`
        : 'disabled (set retrieval.embeddings.enabled=true to enable)',
    });

    // 11. Extraction backend: Anthropic credentials, claude CLI or codex CLI
    const backend = pickBackend(config);
    checks.push({
      name: 'extraction_backend',
      ok: backend !== null,
      detail: backend
        ? `${backend}${config.extraction.backend === 'auto' ? ' (auto)' : ''}`
        : 'none available — extraction will fail',
      ...(backend
        ? {}
        : {
            fix: [
              'Claude Code: which claude   (reinstall or add it to PATH if nothing prints)',
              'Codex:       which codex',
              'API key:     export ANTHROPIC_API_KEY="sk-ant-..." >> ~/.zshrc && source ~/.zshrc',
              'Docs: https://riz007.github.io/somtum/troubleshooting.html#memories-0',
            ],
          }),
    });

    // 12. Hooks: Claude Code (.claude/settings.json) and/or Codex (.codex/hooks.json)
    const hookFiles = [join('.claude', 'settings.json'), join('.codex', 'hooks.json')];
    const installedIn: string[] = [];
    const unreadable: string[] = [];
    for (const rel of hookFiles) {
      const path = join(cwd, rel);
      if (!existsSync(path)) continue;
      try {
        const hooks = (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)['hooks'];
        if (hooks && JSON.stringify(hooks).includes('somtum')) installedIn.push(rel);
      } catch {
        unreadable.push(rel);
      }
    }
    checks.push({
      name: 'hooks_installed',
      ok: installedIn.length > 0,
      detail:
        installedIn.length > 0
          ? `somtum hooks found in ${installedIn.join(', ')}`
          : unreadable.length > 0
            ? `could not parse ${unreadable.join(', ')}`
            : 'no somtum hooks in .claude/settings.json or .codex/hooks.json',
      ...(installedIn.length > 0
        ? {}
        : {
            fix: [
              'somtum init --all            # Claude Code, from the project root',
              'somtum init --agent codex    # Codex, from the project root',
            ],
          }),
    });
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
    if (!check.ok && check.fix && check.fix.length > 0) {
      const indent = '               ';
      for (const line of check.fix) {
        console.log(`${indent}${line}`);
      }
    }
  }
  if (!result.ok) {
    console.log('');
    console.log('somtum doctor found issues. Fix the items marked ✗ above.');
  }
  return result.ok ? 0 : 1;
}
