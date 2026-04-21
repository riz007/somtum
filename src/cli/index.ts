#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init.js';
import { statsCommand } from './stats.js';
import { searchCommand } from './search.js';
import { showCommand } from './show.js';
import { hookCommand } from './hook.js';
import { reindexCommand } from './reindex.js';
import { rebuildCommand } from './rebuild.js';
import { forgetCommand } from './forget.js';
import { editCommand } from './edit.js';
import { exportCommand } from './export.js';
import { importCommand } from './import.js';
import { purgeCommand } from './purge.js';
import { syncCommand } from './sync.js';
import { doctorCommand } from './doctor.js';
import { configGetCommand, configSetCommand } from './config_cmd.js';
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
  .command('rebuild')
  .description('Regenerate index.md from all observations in the current project')
  .option('--json', 'Emit JSON')
  .action((opts: { json?: boolean }) => {
    const code = rebuildCommand({ json: opts.json ?? false });
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
  .description('Search observations by query (all strategies: bm25, embeddings, hybrid, index)')
  .option('-k, --k <n>', 'Number of results', (v) => Number.parseInt(v, 10))
  .option('--strategy <name>', 'Retrieval strategy: bm25 | embeddings | hybrid | index')
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
  .command('forget <id>')
  .description('Soft-delete an observation by id (recoverable via export --include-deleted)')
  .option('--json', 'Emit JSON')
  .action((id: string, opts: { json?: boolean }) => {
    const code = forgetCommand(id, opts);
    process.exit(code);
  });

program
  .command('edit <id>')
  .description('Open an observation body in $EDITOR for editing')
  .action(async (id: string) => {
    const code = await editCommand(id);
    process.exit(code);
  });

program
  .command('export')
  .description('Export observations to JSON, JSONL, or Markdown')
  .option('--format <fmt>', 'Output format: json | jsonl | markdown', 'json')
  .option('--output <path>', 'Write to file instead of stdout')
  .option('--include-deleted', 'Include soft-deleted observations', false)
  .option('--json', 'Alias for --format json')
  .action((opts: { format?: string; output?: string; includeDeleted?: boolean; json?: boolean }) => {
    const exportOpts: Parameters<typeof exportCommand>[0] = {};
    const fmt = opts.json ? 'json' : opts.format;
    if (fmt !== undefined) exportOpts.format = fmt;
    if (opts.output !== undefined) exportOpts.output = opts.output;
    if (opts.includeDeleted !== undefined) exportOpts.includeDeleted = opts.includeDeleted;
    const code = exportCommand(exportOpts);
    process.exit(code);
  });

program
  .command('import <file>')
  .description('Import observations from a JSON or JSONL file')
  .option('--format <fmt>', 'Input format: json | jsonl (auto-detected from extension)')
  .option('--json', 'Emit JSON result summary')
  .action((file: string, opts: { format?: string; json?: boolean }) => {
    const code = importCommand(file, opts);
    process.exit(code);
  });

const configCmd = program
  .command('config')
  .description('Read or write somtum configuration');

configCmd
  .command('get [key]')
  .description('Print config value at key (dot-separated path), or entire config if omitted')
  .option('--json', 'Emit JSON')
  .option('--global', 'Read from global config (~/.somtum/config.json)')
  .action((key: string | undefined, opts: { json?: boolean; global?: boolean }) => {
    const code = configGetCommand(key, opts);
    process.exit(code);
  });

configCmd
  .command('set <key> <value>')
  .description('Set config key (dot-separated) in project .somtum/config.json')
  .option('--global', 'Write to global config (~/.somtum/config.json)')
  .action((key: string, value: string, opts: { global?: boolean }) => {
    const code = configSetCommand(key, value, opts);
    process.exit(code);
  });

program
  .command('purge')
  .description('Hard-delete soft-deleted observations older than a threshold')
  .requiredOption('--older-than <age>', 'Age threshold, e.g. 30d, 24h, 60m')
  .option('--dry-run', 'Preview what would be removed without deleting', false)
  .option('--json', 'Emit JSON')
  .action((opts: { olderThan: string; dryRun?: boolean; json?: boolean }) => {
    const purgeOpts: Parameters<typeof purgeCommand>[0] = { olderThan: opts.olderThan };
    if (opts.dryRun !== undefined) purgeOpts.dryRun = opts.dryRun;
    if (opts.json !== undefined) purgeOpts.json = opts.json;
    const code = purgeCommand(purgeOpts);
    process.exit(code);
  });

const syncCmd = program
  .command('sync')
  .description('SSH-based push/pull sync with a remote host (M6)');

syncCmd
  .command('push')
  .description('Export observations to remote via scp')
  .option('--remote <dest>', 'Override sync.remote config')
  .option('--json', 'Emit JSON')
  .action(async (opts: { remote?: string; json?: boolean }) => {
    const code = await syncCommand('push', opts);
    process.exit(code);
  });

syncCmd
  .command('pull')
  .description('Import observations from remote via scp')
  .option('--remote <src>', 'Override sync.remote config')
  .option('--json', 'Emit JSON')
  .action(async (opts: { remote?: string; json?: boolean }) => {
    const code = await syncCommand('pull', opts);
    process.exit(code);
  });

syncCmd
  .command('status')
  .description('Compare local vs remote observation counts')
  .option('--remote <dest>', 'Override sync.remote config')
  .option('--json', 'Emit JSON')
  .action(async (opts: { remote?: string; json?: boolean }) => {
    const code = await syncCommand('status', opts);
    process.exit(code);
  });

program
  .command('doctor')
  .description('Check somtum setup: DB health, migrations, config, hooks, breakeven ratio')
  .option('--json', 'Emit JSON')
  .action(async (opts: { json?: boolean }) => {
    const code = await doctorCommand(opts);
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
