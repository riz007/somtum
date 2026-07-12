import { describe, it, expect } from 'vitest';
import { parseTranscript, renderTurns, extractPromptResponsePairs } from './transcript.js';

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
    const jsonl = ['{not json', JSON.stringify({ message: { role: 'user', content: 'ok' } })].join(
      '\n',
    );
    expect(parseTranscript(jsonl)).toEqual([{ role: 'user', text: 'ok' }]);
  });

  it('skips lines with unknown roles', () => {
    const jsonl = JSON.stringify({ message: { role: 'admin', content: 'ignored' } });
    expect(parseTranscript(jsonl)).toEqual([]);
  });

  it('reclassifies tool_result user messages as tool turns', () => {
    const jsonl = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', content: 'file contents here' }],
      },
    });
    const turns = parseTranscript(jsonl);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.role).toBe('tool');
  });

  it('keeps user messages that mix text and tool_result as user turns', () => {
    const jsonl = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', content: 'output' },
          { type: 'text', text: 'and also fix the tests' },
        ],
      },
    });
    const turns = parseTranscript(jsonl);
    expect(turns[0]?.role).toBe('user');
  });

  it('skips isMeta and isSidechain lines', () => {
    const jsonl = [
      JSON.stringify({ isMeta: true, message: { role: 'user', content: 'caveat text' } }),
      JSON.stringify({ isSidechain: true, message: { role: 'assistant', content: 'subagent' } }),
      JSON.stringify({ message: { role: 'user', content: 'real prompt' } }),
    ].join('\n');
    expect(parseTranscript(jsonl)).toEqual([{ role: 'user', text: 'real prompt' }]);
  });

  it('truncates oversized tool_result content', () => {
    const jsonl = JSON.stringify({
      message: {
        role: 'user',
        content: [{ type: 'tool_result', content: 'x'.repeat(5000) }],
      },
    });
    const turns = parseTranscript(jsonl);
    expect(turns[0]?.text.length).toBeLessThan(1200);
    expect(turns[0]?.text).toContain('[truncated]');
  });
});

describe('extractPromptResponsePairs', () => {
  it('spans tool turns so multi-tool responses stay in one pair', () => {
    const pairs = extractPromptResponsePairs([
      { role: 'user', text: 'fix the bug' },
      { role: 'assistant', text: 'Let me look.' },
      { role: 'tool', text: '[tool_result …]' },
      { role: 'assistant', text: 'Fixed it in foo.ts.' },
      { role: 'user', text: 'thanks' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.prompt).toBe('fix the bug');
    expect(pairs[0]?.response).toBe('Let me look.\n\nFixed it in foo.ts.');
  });

  it('never uses synthetic turns as cache prompts', () => {
    const pairs = extractPromptResponsePairs([
      { role: 'user', text: '<command-name>/clear</command-name>' },
      { role: 'assistant', text: 'ok' },
      { role: 'user', text: '[Request interrupted by user]' },
      { role: 'assistant', text: 'stopping' },
    ]);
    expect(pairs).toHaveLength(0);
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
