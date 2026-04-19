#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init.js';
import { statsCommand } from './stats.js';
import { searchCommand } from './search.js';
import { showCommand } from './show.js';
import { hookCommand } from './hook.js';
import { reindexCommand } from './reindex.js';
import { runMcpServer } from '../mcp/server.js';

const program = new Command();

program
  .name('somtum')
  .description('Local-first memory and prompt-cache layer for Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Install the SessionEnd capture hook (and optional extras) in the current project')
  .option('-f, --force', 'Reinstall even if the hook is already present', false)
  .option('--cache', 'Also install the UserPromptSubmit cache hook', false)
  .option('--file-gating', 'Also install the PreToolUse file-gating hook', false)
  .option('--no-mcp', 'Do not register the somtum MCP server in .mcp.json')
  .option('--all', 'Enable cache + file-gating + MCP', false)
  .action((opts: { force: boolean; cache: boolean; fileGating: boolean; mcp: boolean; all: boolean }) => {
    const code = initCommand({
      force: opts.force,
      cache: opts.cache,
      fileGating: opts.fileGating,
      mcp: opts.mcp,
      all: opts.all,
    });
    process.exit(code);
  });

program
  .command('reindex')
  .description('Embed any observations that are missing a vector (for hybrid/embeddings retrieval)')
  .option('--json', 'Emit JSON')
  .action(async (opts: { json?: boolean }) => {
    const code = await reindexCommand({ json: opts.json ?? false });
    process.exit(code);
  });

program
  .command('mcp')
  .description('Run the somtum MCP server over stdio (invoked by .mcp.json)')
  .action(async () => {
    try {
      await runMcpServer();
    } catch (err) {
      console.error(`[somtum] mcp server failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Cumulative tokens saved, memory counts, cache size (estimated)')
  .option('--json', 'Emit JSON')
  .action((opts: { json?: boolean }) => {
    const code = statsCommand({ json: opts.json ?? false });
    process.exit(code);
  });

program
  .command('search <query...>')
  .description('Search observations (BM25)')
  .option('-k, --k <n>', 'Number of results', (v) => Number.parseInt(v, 10))
  .option('--strategy <name>', 'Retrieval strategy (currently: bm25 only)')
  .option('--json', 'Emit JSON')
  .action(async (queryParts: string[], opts: { k?: number; strategy?: string; json?: boolean }) => {
    const code = await searchCommand(queryParts.join(' '), opts);
    process.exit(code);
  });

program
  .command('show <id>')
  .description('Print the full body of an observation by id')
  .option('--json', 'Emit JSON')
  .action((id: string, opts: { json?: boolean }) => {
    const code = showCommand(id, opts);
    process.exit(code);
  });

program
  .command('hook <name>')
  .description('Internal: dispatch a hook by name. Invoked by .claude/settings.json.')
  .action(async (name: string) => {
    const code = await hookCommand(name);
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
