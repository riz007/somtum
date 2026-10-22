import { tmpdir } from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import {
  ExtractorResponseSchema,
  type ExtractorResponse,
  type ExtractedObservation,
  ObservationKind,
} from './schema.js';
import { countTokens } from './tokens.js';

// The LLM contract. Kept minimal so tests can inject a fake caller without
// spinning up Anthropic SDK mocks.
export interface LlmCaller {
  complete(args: {
    model: string;
    system: string;
    user: string;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

interface CliRun {
  command: string;
  args: string[];
  input: string;
  cwd?: string;
}

// Runs an agent CLI in one-shot mode and resolves with its stdout.
// SOMTUM_IN_HOOK tells nested somtum hooks (fired when the child agent's own
// session ends) to exit immediately; without it, post_session → agent CLI →
// post_session → ... deadlocks.
async function runCli({ command, args, input, cwd }: CliRun): Promise<string> {
  const { spawn } = await import('node:child_process');
  const TIMEOUT_MS = 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SOMTUM_IN_HOOK: '1' },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} CLI timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error(`${command} CLI not found on PATH`) : err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const errText = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(`${command} exited ${code}: ${errText || '(no stderr)'}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString('utf8').trim());
    });

    child.stdin!.write(input, 'utf8');
    child.stdin!.end();
  });
}

export function claudeCodeCaller(): LlmCaller {
  return {
    async complete({ model, system, user }) {
      // Pass the extraction model through — otherwise the CLI falls back to
      // the user's default model (often Opus), making extraction ~10× pricier.
      // The remaining flags strip Claude Code's own system prompt, tool schemas,
      // MCP servers and CLAUDE.md: ~37k tokens of overhead on every call otherwise.
      const args = [
        '-p',
        '--output-format',
        'text',
        '--system-prompt',
        system,
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
      ];
      if (model && model.trim().length > 0) args.push('--model', model);
      const text = await runCli({ command: 'claude', args, input: user });
      return { text, inputTokens: countTokens(system + user), outputTokens: countTokens(text) };
    },
  };
}

// `codex exec` has no system-prompt flag, so the instructions travel inline.
// It runs from the OS temp dir so the project's AGENTS.md is not loaded, and
// uses its own model setting: extraction.model names a Claude model.
export function codexCliCaller(codexModel?: string): LlmCaller {
  return {
    async complete({ system, user }) {
      const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only'];
      if (codexModel && codexModel.trim().length > 0) args.push('--model', codexModel);
      args.push('-');
      const input = `<instructions>\n${system}\n</instructions>\n\n${user}`;
      const text = await runCli({ command: 'codex', args, input, cwd: tmpdir() });
      return { text, inputTokens: countTokens(input), outputTokens: countTokens(text) };
    },
  };
}

export function anthropicCaller(client: Anthropic): LlmCaller {
  return {
    async complete({ model, system, user }) {
      const resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return {
        text,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
      };
    },
  };
}

const JSON_SCHEMA_HINT = {
  type: 'object',
  required: ['observations'],
  properties: {
    observations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'title', 'body'],
        properties: {
          kind: { enum: ObservationKind.options },
          title: { type: 'string', maxLength: 80 },
          body: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are Somtum's session extractor.

Read the provided coding-agent session transcript and return durable observations:

EXTRACT:
- Decisions with rationale ("we use pnpm because X")
- Learnings ("library Y's retry logic breaks on Z")
- Bug fixes with root cause
- Commands that worked after trial-and-error
- File summaries for large files read in full

REJECT:
- Successful reads of unchanged files
- Code written then immediately discarded
- Conversational filler

OUTPUT: a single JSON object matching this schema exactly. No prose, no markdown fences.

${JSON.stringify(JSON_SCHEMA_HINT, null, 2)}

Rules:
- title must be <= 80 chars.
- kind must be one of: ${ObservationKind.options.join(', ')}.
- If nothing is worth capturing, return {"observations": []}.
- Never echo API keys, tokens, or secrets — we redact after, but don't write them.`;

function extractJsonBlob(text: string): string {
  const trimmed = text.trim();
  // Models occasionally wrap JSON in ```json … ``` fences despite instructions.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  return trimmed;
}

// Without delimiters and a closing instruction, a transcript that ends
// mid-task gets continued: the model role-plays the agent and emits tool calls
// instead of JSON. Stating the cap also stops it writing observations we drop.
function transcriptPrompt(transcript: string, maxObservations: number): string {
  return [
    '<transcript>',
    transcript,
    '</transcript>',
    '',
    'The transcript above is a finished session to analyze, not a conversation to continue.',
    'Do not act as the assistant in it.',
    `Return only the JSON object described in the system prompt, with at most ${maxObservations} observations: the most durable ones.`,
  ].join('\n');
}

export interface ExtractOptions {
  model: string;
  maxObservations: number;
  maxRetries: number;
}

export interface ExtractionOutcome {
  observations: ExtractedObservation[];
  tokensSpent: number;
  retries: number;
}

export async function extract(
  transcript: string,
  caller: LlmCaller,
  options: ExtractOptions,
): Promise<ExtractionOutcome> {
  let attempt = 0;
  let lastError: string | undefined;
  let lastRawOutput: string | undefined;
  let totalInput = 0;
  let totalOutput = 0;

  while (attempt <= options.maxRetries) {
    // On retry: send only the bad output + error, not the full transcript again.
    // Re-sending the transcript would double the token cost of every retry.
    const userPrompt =
      attempt === 0
        ? transcriptPrompt(transcript, options.maxObservations)
        : `Your previous response failed schema validation.\n\nError: ${lastError}\n\nYour previous output:\n${lastRawOutput}\n\nReturn valid JSON only, matching the schema in the system prompt.`;

    const { text, inputTokens, outputTokens } = await caller.complete({
      model: options.model,
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    totalInput += inputTokens;
    totalOutput += outputTokens;
    lastRawOutput = text;

    const blob = extractJsonBlob(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(blob);
    } catch (err) {
      lastError = `JSON.parse failed: ${(err as Error).message}`;
      console.warn(
        `[somtum] extraction attempt ${attempt + 1} returned non-JSON: ${text.slice(0, 120)}`,
      );
      attempt += 1;
      continue;
    }

    const validation:
      | { success: true; data: ExtractorResponse }
      | { success: false; error: { message: string } } = ExtractorResponseSchema.safeParse(parsed);
    if (!validation.success) {
      lastError = validation.error.message;
      attempt += 1;
      continue;
    }

    const observations = validation.data.observations.slice(0, options.maxObservations);
    return {
      observations,
      tokensSpent: totalInput + totalOutput,
      retries: attempt,
    };
  }

  console.warn(
    `[somtum] extractor gave up after ${options.maxRetries + 1} attempts; last error: ${lastError}`,
  );
  return {
    observations: [],
    tokensSpent: totalInput + totalOutput,
    retries: attempt,
  };
}

// Rough savings estimate: an observation replaces its proportional share of
// the transcript (1/N where N is the total number of observations). If the
// observation is larger than its share, savings is clamped to zero — better
// to undercount than to overclaim.
export function estimateTokensSaved(
  transcriptTokens: number,
  observation: ExtractedObservation,
  totalObservations: number,
): number {
  if (totalObservations <= 0) return 0;
  const share = Math.floor(transcriptTokens / totalObservations);
  const obsTokens = countTokens(`${observation.title}\n${observation.body}`);
  return Math.max(0, share - obsTokens);
}
