import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codex } from './codex.js';
import { parseTranscript, extractPromptResponsePairs } from '../core/transcript.js';

const ts = '2026-10-04T14:21:46.573Z';

function line(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: ts, type, payload });
}

function message(role: string, ...texts: string[]): string {
  const blockType = role === 'assistant' ? 'output_text' : 'input_text';
  return line('response_item', {
    type: 'message',
    role,
    content: texts.map((text) => ({ type: blockType, text })),
  });
}

const meta = line('session_meta', {
  id: 'abc',
  cwd: '/repo',
  source: 'vscode',
  thread_source: 'user',
});

describe('codex adapter', () => {
  it('detects rollout files and not Claude Code transcripts', () => {
    expect(codex.detect(`${meta}\n${message('user', 'hi')}`)).toBe(true);
    expect(codex.detect(JSON.stringify({ message: { role: 'user', content: 'hi' } }))).toBe(false);
  });

  it('keeps the conversation and drops developer and injected blocks', () => {
    const turns = codex.parse(
      [
        meta,
        message('developer', '<permissions instructions>sandbox</permissions instructions>'),
        message(
          'user',
          '# AGENTS.md instructions for /repo\n\nbe nice',
          '<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>',
          '<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>',
          'fix the flaky test',
        ),
        line('response_item', { type: 'reasoning', encrypted_content: 'gAAA' }),
        message('assistant', 'Fixed it.'),
        line('event_msg', { type: 'agent_message', message: 'Fixed it.' }),
      ].join('\n'),
    );
    expect(turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'fix the flaky test'],
      ['assistant', 'Fixed it.'],
    ]);
    expect(turns[0]?.timestamp).toBe(ts);
  });

  it('takes only the request out of IDE context blocks', () => {
    for (const heading of ['## My request for Codex:', '## My request:']) {
      const ide = `# Context from my IDE setup:\n\n## Active file: a.ts\n\n${heading}\nadd a clock`;
      expect(codex.parse(`${meta}\n${message('user', ide)}`)[0]?.text).toBe('add a clock');
    }
  });

  it('renders tool calls and outputs, truncated', () => {
    const turns = codex.parse(
      [
        meta,
        line('response_item', {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'pnpm test', pad: 'x'.repeat(2000) }),
        }),
        line('response_item', { type: 'function_call_output', output: 'y'.repeat(5000) }),
      ].join('\n'),
    );
    expect(turns[0]?.role).toBe('assistant');
    expect(turns[0]?.text).toContain('[tool_use exec_command {"cmd":"pnpm test"');
    expect(turns[0]?.text.length).toBeLessThan(400);
    expect(turns[1]?.role).toBe('tool');
    expect(turns[1]?.text.length).toBeLessThan(1200);
  });

  it('collects files touched by apply_patch', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-old',
      '+new',
      '*** Add File: src/b.ts',
      '+hello',
      '*** End Patch',
    ].join('\n');
    const turns = codex.parse(
      `${meta}\n${line('response_item', { type: 'custom_tool_call', name: 'apply_patch', input: patch })}`,
    );
    expect(turns[0]?.files_touched).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('ignores subagent sessions such as guardian reviews', () => {
    const guardian = line('session_meta', {
      source: { subagent: { other: 'guardian' } },
      thread_source: 'guardian_review',
    });
    expect(codex.parse(`${guardian}\n${message('user', 'Assess the planned action')}`)).toEqual([]);
  });

  it('is picked by parseTranscript and pairs prompts with responses', () => {
    const raw = [meta, message('user', 'q1'), message('assistant', 'a1')].join('\n');
    const pairs = extractPromptResponsePairs(parseTranscript(raw));
    expect(pairs).toEqual([{ prompt: 'q1', response: 'a1', files_touched: [] }]);
  });
});

describe('codex findTranscript', () => {
  const original = process.env['CODEX_HOME'];
  let home: string;

  afterEach(() => {
    if (original === undefined) delete process.env['CODEX_HOME'];
    else process.env['CODEX_HOME'] = original;
    rmSync(home, { recursive: true, force: true });
  });

  it('finds a rollout file by session id', () => {
    home = mkdtempSync(join(tmpdir(), 'somtum-codex-'));
    process.env['CODEX_HOME'] = home;
    const day = join(home, 'sessions', '2026', '10', '04');
    mkdirSync(day, { recursive: true });
    const file = join(day, 'rollout-2026-10-04T21-21-46-0001-abcd.jsonl');
    writeFileSync(file, meta);
    expect(codex.findTranscript?.('0001-abcd')).toBe(file);
    expect(codex.findTranscript?.('missing')).toBeNull();
  });
});
