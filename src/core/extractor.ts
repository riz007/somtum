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

export function claudeCodeCaller(): LlmCaller {
  return {
    async complete({ model, system, user }) {
      const { spawn } = await import('node:child_process');

      // Combine system + user since the claude CLI doesn't expose a --system flag.
      // Claude handles <system>…</system> XML delimiters correctly.
      const fullPrompt = `<system>\n${system}\n</system>\n\n${user}`;

      return new Promise((resolve, reject) => {
        // SOMTUM_IN_HOOK tells any nested somtum hook invocations (triggered when
        // the child claude process fires SessionEnd after completing) to exit
        // immediately. Without this, the child's SessionEnd hook would call
        // somtum hook post_session → claude -p → ... causing a deadlock.
        // Pass the extraction model through — otherwise the CLI falls back to
        // the user's default model (often Opus), making extraction ~10× pricier.
        const args = ['-p', '--output-format', 'text'];
        if (model && model.trim().length > 0) args.push('--model', model);
        const child = spawn('claude', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, SOMTUM_IN_HOOK: '1' },
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('claude CLI timed out after 60s'));
        }, 60_000);

        child.on('error', (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          reject(
            err.code === 'ENOENT'
              ? new Error(
                  'Neither ANTHROPIC_API_KEY nor the claude CLI is available. ' +
                    'Set ANTHROPIC_API_KEY in your shell profile or install Claude Code.',
                )
              : err,
          );
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            const errText = Buffer.concat(stderrChunks).toString('utf8').trim();
            reject(new Error(`claude exited ${code}: ${errText || '(no stderr)'}`));
            return;
          }
          const text = Buffer.concat(stdoutChunks).toString('utf8').trim();
          resolve({
            text,
            inputTokens: countTokens(system + user),
            outputTokens: countTokens(text),
          });
        });

        child.stdin!.write(fullPrompt, 'utf8');
        child.stdin!.end();
      });
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

Read the provided Claude Code session transcript and return durable observations:

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
        ? `Transcript:\n\n${transcript}`
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
