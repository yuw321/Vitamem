export { createVitamem } from "./facade/create-vitamem.js";
export { PRESETS } from "./presets.js";
export type { PresetName } from "./presets.js";
export {
  canTransition,
  transition,
  shouldCool,
  shouldGoDormant,
  reactivate,
  InvalidTransitionError,
} from "./lifecycle/state-machine.js";
export {
  extractMemories,
  extractFactsSimple,
  classifySource,
  classifyTags,
  MEMORY_TAGS,
} from "./memory/extraction.js";
export type { MemoryTag } from "./memory/extraction.js";
export {
  cosineSimilarity,
  isDuplicate,
  findMostSimilar,
  deduplicateFacts,
} from "./memory/deduplication.js";
export { validateExtraction } from "./memory/extraction-schema.js";
export type { ValidatedMemory } from "./memory/extraction-schema.js";
export { classifyStructuredFacts, applyStructuredFacts } from "./memory/structured-extraction.js";
export { runEmbeddingPipeline } from "./embedding/pipeline.js";
export {
  applyRecencyWeighting,
  applyMMR,
} from "./retrieval/reranking.js";
export { EphemeralAdapter } from "./storage/ephemeral-adapter.js";
export { SupabaseAdapter } from "./storage/supabase-adapter.js";

// Adapter factories
export { createOpenAIAdapter } from "./adapters/openai.js";
export { createAnthropicAdapter } from "./adapters/anthropic.js";
export { createOllamaAdapter } from "./adapters/ollama.js";

// Backward compatibility
export { EphemeralAdapter as InMemoryAdapter } from "./storage/ephemeral-adapter.js";

export { HEALTH_AUTO_PIN_RULES, HEALTH_STRUCTURED_RULES, createEmptyProfile } from "./types.js";
export type * from "./types.js";
