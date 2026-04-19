// Public API for embedding Somtum in other tools.
// Intentionally narrow; grow it deliberately as needs emerge.

export { openDb, runMigrations, appliedVersions, hasFts5 } from './core/db.js';
export { MemoryStore } from './core/store.js';
export { PromptCache, hashPrompt, normalizePrompt, CACHE_FINGERPRINT_VERSION } from './core/cache.js';
export { Bm25Retriever } from './core/retriever/bm25.js';
export type { Retriever, RetrievalResult, SearchOptions } from './core/retriever/types.js';
export { extract, anthropicCaller, estimateTokensSaved } from './core/extractor.js';
export type { LlmCaller, ExtractOptions, ExtractionOutcome } from './core/extractor.js';
export { countTokens, sumTokens } from './core/tokens.js';
export { redact, redactAll, REDACTION_PLACEHOLDER } from './core/privacy.js';
export { renderIndex, generateIndex } from './core/index_gen.js';
export { runPostSession, HookPayloadSchema } from './hooks/post_session.js';
export { resolveProjectId, projectNameFromCwd } from './core/project_id.js';
export { loadConfig, projectDir, ensureGlobalDir, GLOBAL_DIR, GLOBAL_CONFIG_PATH } from './config.js';
export * from './core/schema.js';
