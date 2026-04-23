import { describe, it, expect } from 'vitest';
import { redact, redactAll, REDACTION_PLACEHOLDER } from '../../src/core/privacy.js';
import { MemoryStore } from '../../src/core/store.js';
import { makeDb, FAKE_SECRETS, DEFAULT_REDACT_PATTERNS, SECRET_TRANSCRIPTS } from './fixtures.js';

// ── redact() unit tests ───────────────────────────────────────────────────────

describe('redact() — default patterns', () => {
  it('strips Anthropic-style sk- keys', () => {
    const out = redactAll(
      `use key ${FAKE_SECRETS.anthropicKey} in your config`,
      DEFAULT_REDACT_PATTERNS,
    );
    expect(out).not.toContain(FAKE_SECRETS.anthropicKey);
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips OpenAI-style sk- keys', () => {
    const out = redactAll(`OPENAI_KEY=${FAKE_SECRETS.openaiKey}`, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain(FAKE_SECRETS.openaiKey);
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips AWS AKIA access keys', () => {
    const out = redactAll(`access_key_id: ${FAKE_SECRETS.awsKey}`, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain(FAKE_SECRETS.awsKey);
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips Slack bot tokens (xoxb-)', () => {
    const out = redactAll(FAKE_SECRETS.slackBot, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain(FAKE_SECRETS.slackBot);
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips Slack app tokens (xoxa-)', () => {
    const out = redactAll(FAKE_SECRETS.slackApp, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain(FAKE_SECRETS.slackApp);
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips Bearer tokens (case-insensitive)', () => {
    const out = redactAll(`Authorization: ${FAKE_SECRETS.bearerToken}`, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain('faketoken1234567890');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips api_key= assignments', () => {
    const out = redactAll(FAKE_SECRETS.apiKeyEquals, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain('mysecretkey12345678');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('strips API_KEY: assignments', () => {
    const out = redactAll(FAKE_SECRETS.apiKeyColon, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain('anothersecretkey9876');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('leaves innocent text unchanged', () => {
    const safe = 'Use pnpm install and then somtum init.';
    const out = redactAll(safe, DEFAULT_REDACT_PATTERNS);
    expect(out).toBe(safe);
  });

  it('redacts multiple secrets in one string', () => {
    const text = `key1=${FAKE_SECRETS.anthropicKey} and slack=${FAKE_SECRETS.slackBot}`;
    const out = redactAll(text, DEFAULT_REDACT_PATTERNS);
    expect(out).not.toContain(FAKE_SECRETS.anthropicKey);
    expect(out).not.toContain(FAKE_SECRETS.slackBot);
  });

  it('handles empty string without throwing', () => {
    expect(redactAll('', DEFAULT_REDACT_PATTERNS)).toBe('');
  });

  it('skips malformed regex patterns without disabling the rest', () => {
    const patterns = ['[invalid(regex', ...DEFAULT_REDACT_PATTERNS];
    const out = redact(`key ${FAKE_SECRETS.awsKey}`, { patterns });
    expect(out).not.toContain(FAKE_SECRETS.awsKey);
  });
});

// ── store.insert() redaction integration ─────────────────────────────────────

describe('store.insert() — redacts secrets before writing to DB', () => {
  it('removes sk- key from observation body', () => {
    const db = makeDb();
    const store = new MemoryStore(db);
    const obs = store.insert(
      {
        project_id: 'test',
        session_id: 'sess-1',
        kind: 'other',
        title: 'Config note',
        body: `Set ANTHROPIC_API_KEY to ${FAKE_SECRETS.anthropicKey} in .env`,
      },
      { redactPatterns: DEFAULT_REDACT_PATTERNS },
    );
    expect(obs.body).not.toContain(FAKE_SECRETS.anthropicKey);
    expect(obs.body).toContain(REDACTION_PLACEHOLDER);
    db.close();
  });

  it('removes AWS key from observation title', () => {
    const db = makeDb();
    const store = new MemoryStore(db);
    const obs = store.insert(
      {
        project_id: 'test',
        session_id: 'sess-1',
        kind: 'other',
        title: `Credentials: ${FAKE_SECRETS.awsKey}`,
        body: 'See above',
      },
      { redactPatterns: DEFAULT_REDACT_PATTERNS },
    );
    expect(obs.title).not.toContain(FAKE_SECRETS.awsKey);
    expect(obs.title).toContain(REDACTION_PLACEHOLDER);
    db.close();
  });

  it('redacts all secrets when transcript contains multiple', () => {
    const db = makeDb();
    const store = new MemoryStore(db);
    const obs = store.insert(
      {
        project_id: 'test',
        session_id: 'sess-1',
        kind: 'other',
        title: 'Multi-secret note',
        body: SECRET_TRANSCRIPTS.multipleSecrets,
      },
      { redactPatterns: DEFAULT_REDACT_PATTERNS },
    );
    expect(obs.body).not.toContain('mysecretkey12345678');
    expect(obs.body).not.toContain(FAKE_SECRETS.slackBot);
    db.close();
  });

  it('stores safely when no patterns are given', () => {
    const db = makeDb();
    const store = new MemoryStore(db);
    // No redactPatterns — should not throw, body stored verbatim
    expect(() =>
      store.insert(
        { project_id: 'test', session_id: 'sess-1', kind: 'other', title: 'x', body: 'safe' },
        {},
      ),
    ).not.toThrow();
    db.close();
  });

  it('persisted observation in DB also has secret removed', () => {
    const db = makeDb();
    const store = new MemoryStore(db);
    const inserted = store.insert(
      {
        project_id: 'test',
        session_id: 'sess-1',
        kind: 'other',
        title: 'key note',
        body: `token: ${FAKE_SECRETS.bearerToken}`,
      },
      { redactPatterns: DEFAULT_REDACT_PATTERNS },
    );
    // Re-fetch from DB to confirm the secret was never written
    const fetched = store.get(inserted.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.body).not.toContain('faketoken1234567890');
    db.close();
  });
});
