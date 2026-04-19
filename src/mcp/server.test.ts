import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openDb } from '../core/db.js';
import { ConfigSchema } from '../core/schema.js';
import { buildServer } from './server.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-mcp-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function start(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const db = openDb({ path: join(tmp, 'db.sqlite') });
  const config = ConfigSchema.parse({});
  const { server, close } = buildServer({
    db,
    config,
    projectId: 'test-project',
    cwd: tmp,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
      close();
    },
  };
}

function parseText(result: { content: { type: string; text?: string }[] }): unknown {
  const first = result.content[0];
  if (!first || first.type !== 'text' || first.text === undefined) {
    throw new Error('expected text content');
  }
  return JSON.parse(first.text);
}

describe('MCP server', () => {
  it('lists all six tools', async () => {
    const { client, close } = await start();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(
        ['cache_lookup', 'forget', 'get', 'recall', 'remember', 'stats'].sort(),
      );
    } finally {
      await close();
    }
  });

  it('remembers then recalls an observation', async () => {
    const { client, close } = await start();
    try {
      const rem = await client.callTool({
        name: 'remember',
        arguments: {
          title: 'Cache key fingerprint',
          body: 'We hash files_touched + content_hashes so edits invalidate entries.',
          kind: 'decision',
        },
      });
      const remPayload = parseText(rem as never) as { id: string; tokens: number };
      expect(remPayload.id).toBeTruthy();
      expect(remPayload.tokens).toBeGreaterThan(0);

      const rec = await client.callTool({
        name: 'recall',
        arguments: { query: 'fingerprint cache invalidation' },
      });
      const recPayload = parseText(rec as never) as {
        results: { id: string; title: string }[];
        strategy: string;
      };
      expect(recPayload.strategy).toBe('bm25');
      expect(recPayload.results.length).toBeGreaterThan(0);
      expect(recPayload.results[0]?.title).toBe('Cache key fingerprint');
    } finally {
      await close();
    }
  });

  it('get returns the full body by id, forget soft-deletes it', async () => {
    const { client, close } = await start();
    try {
      const rem = await client.callTool({
        name: 'remember',
        arguments: { title: 'Test entry', body: 'Body text here' },
      });
      const { id } = parseText(rem as never) as { id: string };

      const got = await client.callTool({
        name: 'get',
        arguments: { ids: [id] },
      });
      const gotPayload = parseText(got as never) as {
        observations: { id: string; body: string }[];
      };
      expect(gotPayload.observations[0]?.body).toBe('Body text here');

      const forgotten = await client.callTool({
        name: 'forget',
        arguments: { id },
      });
      expect((parseText(forgotten as never) as { ok: boolean }).ok).toBe(true);

      const gotAgain = await client.callTool({
        name: 'get',
        arguments: { ids: [id] },
      });
      expect(
        (parseText(gotAgain as never) as { observations: unknown[] }).observations,
      ).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('cache_lookup returns {hit:false} for an unknown prompt', async () => {
    const { client, close } = await start();
    try {
      const result = await client.callTool({
        name: 'cache_lookup',
        arguments: { prompt: 'never-cached-prompt-xyz' },
      });
      expect((parseText(result as never) as { hit: boolean }).hit).toBe(false);
    } finally {
      await close();
    }
  });

  it('stats reports project counts and cache size', async () => {
    const { client, close } = await start();
    try {
      await client.callTool({
        name: 'remember',
        arguments: { title: 'one', body: 'body one', kind: 'learning' },
      });
      const result = await client.callTool({ name: 'stats', arguments: {} });
      const payload = parseText(result as never) as {
        project_id: string;
        memories: number;
        by_kind: Record<string, number>;
      };
      expect(payload.project_id).toBe('test-project');
      expect(payload.memories).toBe(1);
      expect(payload.by_kind['learning']).toBe(1);
    } finally {
      await close();
    }
  });

  it('returns isError for invalid recall input', async () => {
    const { client, close } = await start();
    try {
      const result = (await client.callTool({
        name: 'recall',
        arguments: { query: '' },
      })) as { isError?: boolean; content: { type: string; text?: string }[] };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/at least 1 character/);
    } finally {
      await close();
    }
  });
});
