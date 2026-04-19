import { describe, it, expect } from 'vitest';
import { parseTranscript, renderTurns } from './transcript.js';

describe('parseTranscript', () => {
  it('returns a single user turn for plain text input', () => {
    const turns = parseTranscript('just some text');
    expect(turns).toEqual([{ role: 'user', text: 'just some text' }]);
  });

  it('returns empty for empty input', () => {
    expect(parseTranscript('')).toEqual([]);
  });

  it('parses Claude Code-style JSONL with message.role + content array', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'Hello' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there.' }],
        },
      }),
    ].join('\n');
    const turns = parseTranscript(jsonl);
    expect(turns).toEqual([
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there.' },
    ]);
  });

  it('coerces tool_use blocks into a readable sentinel', () => {
    const jsonl = JSON.stringify({
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }],
      },
    });
    const turns = parseTranscript(jsonl);
    expect(turns[0]?.text).toMatch(/\[tool_use Read/);
  });

  it('skips lines that are not valid JSON', () => {
    const jsonl = [
      '{not json',
      JSON.stringify({ message: { role: 'user', content: 'ok' } }),
    ].join('\n');
    expect(parseTranscript(jsonl)).toEqual([{ role: 'user', text: 'ok' }]);
  });

  it('skips lines with unknown roles', () => {
    const jsonl = JSON.stringify({ message: { role: 'admin', content: 'ignored' } });
    expect(parseTranscript(jsonl)).toEqual([]);
  });
});

describe('renderTurns', () => {
  it('joins role-prefixed turns with blank lines', () => {
    expect(
      renderTurns([
        { role: 'user', text: 'a' },
        { role: 'assistant', text: 'b' },
      ]),
    ).toBe('user: a\n\nassistant: b');
  });
});
