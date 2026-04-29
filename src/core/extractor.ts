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
  let totalInput = 0;
  let totalOutput = 0;

  while (attempt <= options.maxRetries) {
    const userPrompt =
      attempt === 0
        ? `Transcript:\n\n${transcript}`
        : `Transcript:\n\n${transcript}\n\nPrevious attempt produced output that failed schema validation with error:\n${lastError}\n\nReturn valid JSON only.`;

    const { text, inputTokens, outputTokens } = await caller.complete({
      model: options.model,
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    totalInput += inputTokens;
    totalOutput += outputTokens;

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
