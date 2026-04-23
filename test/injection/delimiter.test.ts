import { describe, it, expect } from 'vitest';
import {
  wrapMemoryBody,
  MEMORY_DELIMITER_OPEN,
  MEMORY_DELIMITER_CLOSE,
  get as mcpGet,
} from '../../src/mcp/tools.js';
import { MemoryStore } from '../../src/core/store.js';
import { makeDb, ADVERSARIAL_BODIES } from './fixtures.js';
import type { ToolContext } from '../../src/mcp/tools.js';
import { ConfigSchema } from '../../src/core/schema.js';

function makeCtx(projectId = 'test-project'): ToolContext {
  const db = makeDb();
  const config = ConfigSchema.parse({});
  return { db, config, projectId };
}

// ── wrapMemoryBody() unit tests ───────────────────────────────────────────────

describe('wrapMemoryBody()', () => {
  it('opens with the hardening delimiter', () => {
    const wrapped = wrapMemoryBody('some body text');
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
  });

  it('closes with the closing tag', () => {
    const wrapped = wrapMemoryBody('some body text');
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('preserves the original body between the delimiters', () => {
    const body = 'Use pnpm, not npm.';
    const wrapped = wrapMemoryBody(body);
    expect(wrapped).toContain(body);
  });

  it('wraps empty string without throwing', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.empty);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('wraps whitespace-only body', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.whitespace);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('wraps very long body without truncation', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.longBody);
    expect(wrapped).toContain(ADVERSARIAL_BODIES.longBody);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });
});

// ── Adversarial content — wrapper must remain intact ─────────────────────────

describe('wrapMemoryBody() — adversarial bodies cannot escape the wrapper', () => {
  it('instruction-override body is still wrapped', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.instructionOverride);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('closing-tag-escape body does not terminate wrapper early', () => {
    // The adversarial body contains "[/Somtum memory]" mid-string.
    // The real closing tag must still be last.
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.closingTagEscape);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
    // The first occurrence of the closing tag is inside the body, not at end.
    const firstClose = wrapped.indexOf(MEMORY_DELIMITER_CLOSE);
    const lastClose = wrapped.lastIndexOf(MEMORY_DELIMITER_CLOSE);
    expect(firstClose).not.toBe(lastClose); // appears twice: once in body, once as real close
  });

  it('nested opening delimiter does not confuse the wrapper', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.nestedOpen);
    // The outer open delimiter must appear exactly once at position 0.
    expect(wrapped.indexOf(MEMORY_DELIMITER_OPEN)).toBe(0);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('<system> tag body is still wrapped', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.systemTag);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('role-play body is still wrapped', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.rolePlay);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('unicode-lookalike escape does not terminate wrapper', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.unicodeEscape);
    // Real close tag must be the final characters.
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });

  it('control characters in body do not break wrapping', () => {
    const wrapped = wrapMemoryBody(ADVERSARIAL_BODIES.controlChars);
    expect(wrapped.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(wrapped.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
  });
});

// ── MCP get tool — integration ────────────────────────────────────────────────

describe('MCP get tool — bodies are wrapped before reaching the agent', () => {
  it('wraps a normal observation body', () => {
    const ctx = makeCtx();
    const store = new MemoryStore(ctx.db);
    const obs = store.insert({
      project_id: ctx.projectId,
      session_id: 'sess',
      kind: 'decision',
      title: 'Use WAL mode',
      body: 'Enabled WAL for concurrent reads.',
    });

    const result = mcpGet(ctx, { ids: [obs.id] }) as {
      observations: Array<{ body: string }>;
    };

    const body = result.observations[0]!.body;
    expect(body.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(body.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
    expect(body).toContain('Enabled WAL for concurrent reads.');
    ctx.db.close();
  });

  it('wraps all observations when multiple IDs are requested', () => {
    const ctx = makeCtx();
    const store = new MemoryStore(ctx.db);
    const a = store.insert({
      project_id: ctx.projectId,
      session_id: 'sess',
      kind: 'decision',
      title: 'A',
      body: 'Body A',
    });
    const b = store.insert({
      project_id: ctx.projectId,
      session_id: 'sess',
      kind: 'bugfix',
      title: 'B',
      body: 'Body B',
    });

    const result = mcpGet(ctx, { ids: [a.id, b.id] }) as {
      observations: Array<{ body: string }>;
    };

    for (const obs of result.observations) {
      expect(obs.body.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
      expect(obs.body.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
    }
    ctx.db.close();
  });

  it('wraps adversarial body content retrieved from the DB', () => {
    const ctx = makeCtx();
    const store = new MemoryStore(ctx.db);
    const obs = store.insert({
      project_id: ctx.projectId,
      session_id: 'sess',
      kind: 'other',
      title: 'Adversarial',
      body: ADVERSARIAL_BODIES.closingTagEscape,
    });

    const result = mcpGet(ctx, { ids: [obs.id] }) as {
      observations: Array<{ body: string }>;
    };

    const body = result.observations[0]!.body;
    expect(body.startsWith(MEMORY_DELIMITER_OPEN)).toBe(true);
    expect(body.endsWith(MEMORY_DELIMITER_CLOSE)).toBe(true);
    ctx.db.close();
  });

  it('returns empty observations array for soft-deleted entries', () => {
    const ctx = makeCtx();
    const store = new MemoryStore(ctx.db);
    const obs = store.insert({
      project_id: ctx.projectId,
      session_id: 'sess',
      kind: 'other',
      title: 'Gone',
      body: 'Will be deleted',
    });
    store.softDelete(obs.id);

    const result = mcpGet(ctx, { ids: [obs.id] }) as {
      observations: Array<unknown>;
    };
    expect(result.observations).toHaveLength(0);
    ctx.db.close();
  });
});
