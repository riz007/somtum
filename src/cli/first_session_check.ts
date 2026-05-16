import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, projectDir } from '../config.js';
import { resolveProjectId } from '../core/project_id.js';

interface FirstSessionState {
  first_session_completed: boolean;
  first_session_inserted: number;
  first_session_timestamp: string;
  diagnostic_shown?: boolean;
}

/**
 * FIX-05: After a zero-memory first session, automatically surface the most
 * important doctor checks on the next somtum command so the user can self-heal
 * without reading the docs.
 *
 * Runs at most once per project. Opt-out: `somtum config set diagnostics.first_session_check false`
 */
export function checkFirstSession(opts: { cwd?: string } = {}): void {
  try {
    const cwd = opts.cwd ?? process.cwd();

    const config = loadConfig({ cwd });
    if (!config.diagnostics.first_session_check) return;

    const projectId = resolveProjectId(cwd);
    const flagPath = join(projectDir(projectId), 'first_session.json');

    if (!existsSync(flagPath)) return;

    let state: FirstSessionState;
    try {
      state = JSON.parse(readFileSync(flagPath, 'utf8')) as FirstSessionState;
    } catch {
      return;
    }

    if (!state.first_session_completed) return;
    if (state.diagnostic_shown) return;
    if (state.first_session_inserted > 0) {
      // Session produced memories — mark shown and exit silently.
      markDiagnosticShown(flagPath, state);
      return;
    }

    // First session completed with zero memories — run the key checks.
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    const hasApiKey = Boolean(apiKey && apiKey.trim().length > 0);
    let claudeCliAvailable = false;
    if (!hasApiKey) {
      try {
        execSync('claude --version', { stdio: 'pipe' });
        claudeCliAvailable = true;
      } catch {
        // not in PATH
      }
    }

    const settingsPath = join(cwd, '.claude', 'settings.json');
    const hooksInstalled =
      existsSync(settingsPath) &&
      (() => {
        try {
          const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
          return JSON.stringify(raw['hooks'] ?? '').includes('somtum');
        } catch {
          return false;
        }
      })();

    const apiOk = hasApiKey || claudeCliAvailable;

    process.stderr.write(
      [
        '',
        'Somtum first-session check (run automatically because memories=0 after your first session)',
        '',
        `  api_key          ${apiOk ? '✓' : '✗  No backend found — claude CLI not in PATH, no ANTHROPIC_API_KEY'}`,
        `  hooks_installed  ${hooksInstalled ? '✓' : '✗  Hooks not found in .claude/settings.json'}`,
        '',
      ].join('\n'),
    );

    if (!apiOk || !hooksInstalled) {
      process.stderr.write(
        [
          'One or more checks failed. See:',
          '  https://riz007.github.io/somtum/troubleshooting.html#memories-0',
          '',
          'To suppress this check: somtum config set diagnostics.first_session_check false',
          '',
        ].join('\n'),
      );
    } else {
      process.stderr.write(
        [
          'All key checks pass. If memories are still 0, the session may have been',
          'too short or contained no decisions/bugfixes worth capturing.',
          '',
          'To suppress this check: somtum config set diagnostics.first_session_check false',
          '',
        ].join('\n'),
      );
    }

    markDiagnosticShown(flagPath, state);
  } catch {
    // Non-fatal: diagnostic check must never crash a user command.
  }
}

function markDiagnosticShown(flagPath: string, state: FirstSessionState): void {
  try {
    writeFileSync(flagPath, JSON.stringify({ ...state, diagnostic_shown: true }), 'utf8');
  } catch {
    // Non-fatal.
  }
}
