import { execFileSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicCaller, claudeCodeCaller, codexCliCaller, type LlmCaller } from './extractor.js';
import type { Config } from './schema.js';

export type Backend = 'anthropic' | 'claude-cli' | 'codex-cli';

function onPath(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL is how Anthropic-compatible
// providers (GLM, proxies) are configured; the SDK reads both itself.
function hasAnthropicCredentials(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env['ANTHROPIC_API_KEY']?.trim() || env['ANTHROPIC_AUTH_TOKEN']?.trim());
}

export function pickBackend(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
  has: (bin: string) => boolean = onPath,
): Backend | null {
  const wanted = config.extraction.backend;
  if (wanted !== 'auto') return wanted;
  if (hasAnthropicCredentials(env)) return 'anthropic';
  if (has('claude')) return 'claude-cli';
  if (has('codex')) return 'codex-cli';
  return null;
}

export function callerFor(backend: Backend, config: Config): LlmCaller {
  switch (backend) {
    case 'anthropic':
      // 25s per call: the SDK default of 600s lets one slow request hold the
      // hook open for 10 minutes.
      return anthropicCaller(new Anthropic({ timeout: 25_000 }));
    case 'claude-cli':
      return claudeCodeCaller();
    case 'codex-cli':
      return codexCliCaller(config.extraction.codex_model);
  }
}

export const NO_BACKEND_MESSAGE =
  'No extraction backend: set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL), ' +
  'or install the claude or codex CLI.';
