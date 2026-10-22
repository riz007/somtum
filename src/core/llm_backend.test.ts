import { describe, it, expect } from 'vitest';
import { ConfigSchema } from './schema.js';
import { pickBackend } from './llm_backend.js';

const auto = ConfigSchema.parse({});
const onPath =
  (...bins: string[]) =>
  (bin: string) =>
    bins.includes(bin);

describe('pickBackend', () => {
  it('prefers the Anthropic API when a key is set', () => {
    expect(pickBackend(auto, { ANTHROPIC_API_KEY: 'sk-x' }, onPath('claude', 'codex'))).toBe(
      'anthropic',
    );
  });

  it('treats ANTHROPIC_AUTH_TOKEN as Anthropic-compatible credentials', () => {
    expect(pickBackend(auto, { ANTHROPIC_AUTH_TOKEN: 'glm-x' }, onPath())).toBe('anthropic');
  });

  it('ignores blank credentials', () => {
    expect(pickBackend(auto, { ANTHROPIC_API_KEY: '  ' }, onPath('claude'))).toBe('claude-cli');
  });

  it('falls back to claude, then codex', () => {
    expect(pickBackend(auto, {}, onPath('claude', 'codex'))).toBe('claude-cli');
    expect(pickBackend(auto, {}, onPath('codex'))).toBe('codex-cli');
  });

  it('returns null when nothing is available', () => {
    expect(pickBackend(auto, {}, onPath())).toBeNull();
  });

  it('honors an explicit backend', () => {
    const config = ConfigSchema.parse({ extraction: { backend: 'codex-cli' } });
    expect(pickBackend(config, { ANTHROPIC_API_KEY: 'sk-x' }, onPath('claude'))).toBe('codex-cli');
  });
});
