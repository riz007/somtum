import { describe, it, expect, vi } from 'vitest';
import { extract, estimateTokensSaved, type LlmCaller } from './extractor.js';

function fakeCaller(responses: string[]): LlmCaller & { calls: number } {
  let i = 0;
  const caller = {
    calls: 0,
    async complete() {
      const text = responses[i] ?? responses[responses.length - 1] ?? '';
      i += 1;
      caller.calls += 1;
      return { text, inputTokens: 10, outputTokens: 20 };
    },
  };
  return caller;
}

describe('extract', () => {
  it('parses a valid JSON response on first try', async () => {
    const caller = fakeCaller([
      JSON.stringify({
        observations: [
          { kind: 'decision', title: 'Use pnpm', body: 'Workspaces.' },
          { kind: 'bugfix', title: 'Fix auth', body: 'Root cause.', files: ['a.ts'] },
        ],
      }),
    ]);

    const out = await extract('some transcript', caller, {
      model: 'claude-haiku-4-5-20251001',
      maxObservations: 10,
      maxRetries: 1,
    });
    expect(caller.calls).toBe(1);
    expect(out.observations).toHaveLength(2);
    expect(out.retries).toBe(0);
    expect(out.tokensSpent).toBe(30);
  });

  it('retries once when the first output is malformed, then succeeds', async () => {
    const caller = fakeCaller([
      'not json at all',
      JSON.stringify({
        observations: [{ kind: 'learning', title: 'x', body: 'y' }],
      }),
    ]);
    const out = await extract('t', caller, {
      model: 'm',
      maxObservations: 10,
      maxRetries: 1,
    });
    expect(caller.calls).toBe(2);
    expect(out.retries).toBe(1);
    expect(out.observations).toHaveLength(1);
  });

  it('returns empty observations and warns when all retries fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const caller = fakeCaller(['not json', 'still not json']);
    const out = await extract('t', caller, {
      model: 'm',
      maxObservations: 10,
      maxRetries: 1,
    });
    expect(out.observations).toEqual([]);
    expect(caller.calls).toBe(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('strips ```json fences', async () => {
    const caller = fakeCaller([
      '```json\n{"observations":[{"kind":"command","title":"a","body":"b"}]}\n```',
    ]);
    const out = await extract('t', caller, {
      model: 'm',
      maxObservations: 10,
      maxRetries: 1,
    });
    expect(out.observations).toHaveLength(1);
  });

  it('caps observations at maxObservations', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      kind: 'learning',
      title: `t${i}`,
      body: 'b',
    }));
    const caller = fakeCaller([JSON.stringify({ observations: many })]);
    const out = await extract('t', caller, {
      model: 'm',
      maxObservations: 5,
      maxRetries: 1,
    });
    expect(out.observations).toHaveLength(5);
  });

  it('rejects observations with invalid kind (retries then gives up)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = JSON.stringify({
      observations: [{ kind: 'totally-fake', title: 't', body: 'b' }],
    });
    const caller = fakeCaller([bad, bad]);
    const out = await extract('t', caller, {
      model: 'm',
      maxObservations: 10,
      maxRetries: 1,
    });
    expect(out.observations).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('estimateTokensSaved', () => {
  it('undercounts rather than overclaims', () => {
    // A tiny observation replacing its share of a small transcript => small positive savings.
    const saved = estimateTokensSaved(100, { kind: 'learning', title: 'x', body: 'y', files: [], tags: [] }, 2);
    expect(saved).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 when obs is larger than its share', () => {
    const saved = estimateTokensSaved(10, { kind: 'learning', title: 'a very long observation body that exceeds share', body: 'more', files: [], tags: [] }, 1);
    expect(saved).toBe(0);
  });

  it('returns 0 when no observations', () => {
    expect(
      estimateTokensSaved(100, { kind: 'learning', title: 'x', body: 'y', files: [], tags: [] }, 0),
    ).toBe(0);
  });
});
