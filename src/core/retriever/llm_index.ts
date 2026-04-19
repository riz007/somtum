import { z } from 'zod';
import type { DB } from '../db.js';
import { MemoryStore } from '../store.js';
import type { LlmCaller } from '../extractor.js';
import type { Observation } from '../schema.js';
import type { Retriever, RetrievalResult, SearchOptions } from './types.js';

// LLM-backed retriever. Feeds a compact catalog (id + title + kind + files +
// tags) to a cheap model and asks it to pick the top-K observation IDs.
// Slower and costlier than BM25, but much better at paraphrased queries
// and cross-field intent ("auth stuff" → matches an observation titled
// "JWT session rotation"). Falls back to BM25 via the factory when the
// caller or the `retrieval.index.enabled` flag is missing.

const SYSTEM_PROMPT = `You are Somtum's index retriever. You are given a user query and a catalog of stored observations (each with id, kind, title, tags, files). Pick the most relevant observations for the query.

OUTPUT: a single JSON object, no prose, no markdown fences:
{"ids": ["id1","id2",...]}

Rules:
- Only include IDs that appear verbatim in the catalog.
- Order by relevance, most relevant first.
- Return at most the number of IDs requested by the user.
- If nothing matches, return {"ids": []}.`;

const IdsSchema = z.object({ ids: z.array(z.string()) });

interface CatalogEntry {
  id: string;
  kind: string;
  title: string;
  tags: string[];
  files: string[];
}

function toCatalog(observations: Observation[]): CatalogEntry[] {
  return observations.map((o) => ({
    id: o.id,
    kind: o.kind,
    title: o.title,
    tags: o.tags,
    files: o.files,
  }));
}

function extractJsonBlob(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  return trimmed;
}

export interface LlmIndexRetrieverOptions {
  caller: LlmCaller;
  model: string;
  // Maximum number of catalog entries to send to the LLM. Large projects
  // get truncated to the most recent N observations so we don't blow the
  // context window.
  maxCatalog?: number;
}

const DEFAULT_MAX_CATALOG = 500;

export class LlmIndexRetriever implements Retriever {
  readonly name = 'index' as const;
  private readonly store: MemoryStore;
  private readonly caller: LlmCaller;
  private readonly model: string;
  private readonly maxCatalog: number;

  constructor(db: DB, opts: LlmIndexRetrieverOptions) {
    this.store = new MemoryStore(db);
    this.caller = opts.caller;
    this.model = opts.model;
    this.maxCatalog = opts.maxCatalog ?? DEFAULT_MAX_CATALOG;
  }

  async search(query: string, options: SearchOptions): Promise<RetrievalResult[]> {
    if (query.trim().length === 0) return [];

    // listByProject returns most-recent first, so truncation drops the oldest.
    const all = this.store.listByProject(options.projectId, { limit: this.maxCatalog });
    if (all.length === 0) return [];

    const catalog = toCatalog(all);
    const user =
      `Query: ${query}\n\n` +
      `Return up to ${options.k} IDs.\n\n` +
      `Catalog:\n${JSON.stringify(catalog)}`;

    const { text } = await this.caller.complete({
      model: this.model,
      system: SYSTEM_PROMPT,
      user,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonBlob(text));
    } catch {
      return [];
    }
    const validated = IdsSchema.safeParse(parsed);
    if (!validated.success) return [];

    const byId = new Map(all.map((o) => [o.id, o]));
    const results: RetrievalResult[] = [];
    const top = validated.data.ids.slice(0, options.k);
    top.forEach((id, idx) => {
      const obs = byId.get(id);
      if (!obs) return;
      // Synthetic linear score so callers that rank multiple strategies
      // can still compare. Top hit = 1.0, last hit = ~1/k.
      const score = (top.length - idx) / top.length;
      results.push({ id, score, observation: obs, source: 'index' });
    });
    return results;
  }
}
