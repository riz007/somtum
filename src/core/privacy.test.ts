import { describe, it, expect } from 'vitest';
import { redact, redactAll, REDACTION_PLACEHOLDER } from './privacy.js';
import { ConfigSchema } from './schema.js';

const DEFAULT_PATTERNS = ConfigSchema.parse({}).privacy.redact_patterns;

describe('redact with default config patterns', () => {
  it('removes a fake Anthropic-style key', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrstuvwxyz012345';
    const out = redactAll(input, DEFAULT_PATTERNS);
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('removes a bearer token', () => {
    const input = 'Authorization: Bearer abc.def.ghi-123';
    const out = redactAll(input, DEFAULT_PATTERNS);
    expect(out.toLowerCase()).not.toContain('abc.def.ghi-123');
  });

  it('removes an AWS access key ID', () => {
    const input = 'aws: AKIAIOSFODNN7EXAMPLE deploying';
    const out = redactAll(input, DEFAULT_PATTERNS);
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('removes a slack-style token', () => {
    const input = 'token=xoxb-1234567890-abcdefghij';
    const out = redactAll(input, DEFAULT_PATTERNS);
    expect(out).not.toContain('xoxb-1234567890-abcdefghij');
  });

  it('leaves non-secret text alone', () => {
    const input = 'We chose pnpm for workspace support.';
    expect(redactAll(input, DEFAULT_PATTERNS)).toBe(input);
  });
});

describe('redact edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(redactAll('', DEFAULT_PATTERNS)).toBe('');
  });

  it('skips malformed patterns without failing overall', () => {
    const out = redact('api_key=abcdefghijklmnop', {
      patterns: ['[unclosed', 'api[_-]?key\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-]{8,}'],
    });
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('honors a custom placeholder', () => {
    const out = redact('bearer abc.def.ghi', {
      patterns: ['bearer\\s+[A-Za-z0-9_\\-.]+'],
      placeholder: '***',
    });
    expect(out).toBe('***');
  });
});
