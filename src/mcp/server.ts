import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config.js';
import { projectDir } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import type { Config } from '../core/schema.js';
import {
  RecallInput,
  GetInput,
  RememberInput,
  CacheLookupInput,
  ForgetInput,
  StatsInput,
  recall,
  get,
  remember,
  cacheLookup,
  forget,
  stats,
  type ToolContext,
} from './tools.js';

export interface BuildOptions {
  db?: DB;
  dbPath?: string;
  cwd?: string;
  config?: Config;
  projectId?: string;
}

interface BuildResult {
  server: McpServer;
  context: ToolContext;
  close: () => void;
}

// JSON-encoded text is the lowest-common-denominator content type that every
// MCP client can render. Clients that understand `structuredContent` get the
// same payload without a parse step.
function jsonResult(payload: object): {
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
} {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function errorResult(err: unknown): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return {
    content: [{ type: 'text', text: (err as Error).message }],
    isError: true,
  };
}

export function buildServer(opts: BuildOptions = {}): BuildResult {
  const cwd = opts.cwd ?? process.cwd();
  const config = opts.config ?? loadConfig({ cwd });
  const projectId = opts.projectId ?? resolveProjectId(cwd);

  const ownsDb = opts.db === undefined;
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = opts.db ?? openDb({ path: dbPath });

  const context: ToolContext = { db, config, projectId };

  const server = new McpServer({ name: 'somtum', version: '0.1.0' }, { capabilities: {} });

  server.registerTool(
    'recall',
    {
      description:
        'Search project memory for observations matching a query. Returns id/title/kind/files/score per hit.',
      inputSchema: RecallInput.shape,
    },
    async (args) => {
      try {
        return jsonResult(await recall(context, args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get',
    {
      description: 'Fetch full observation bodies by id.',
      inputSchema: GetInput.shape,
    },
    async (args) => {
      try {
        return jsonResult(get(context, args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'remember',
    {
      description:
        'Write a new observation into project memory. Redaction is applied before storage.',
      inputSchema: RememberInput.shape,
    },
    async (args) => {
      try {
        return jsonResult(remember(context, args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'cache_lookup',
    {
      description:
        'Check the prompt cache for a hit. Returns {hit:false} if the prompt is not cached.',
      inputSchema: CacheLookupInput.shape,
    },
    async (args) => {
      try {
        return jsonResult(cacheLookup(context, args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'forget',
    {
      description: 'Soft-delete an observation by id.',
      inputSchema: ForgetInput.shape,
    },
    async (args) => {
      try {
        return jsonResult(forget(context, args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'stats',
    {
      description:
        'Return per-project memory counts, cache size, and estimated tokens saved vs spent.',
      inputSchema: StatsInput.shape,
    },
    async () => {
      try {
        return jsonResult(stats(context));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return {
    server,
    context,
    close: () => {
      if (ownsDb) db.close();
    },
  };
}

export async function runMcpServer(opts: BuildOptions = {}): Promise<void> {
  const { server, close } = buildServer(opts);
  const transport = new StdioServerTransport();
  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } finally {
      close();
    }
  };
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  await server.connect(transport);
}
