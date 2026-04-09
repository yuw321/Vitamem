export { createVitamem } from "./facade/create-vitamem.js";
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
} from "./memory/extraction.js";
export {
  cosineSimilarity,
  isDuplicate,
  findMostSimilar,
  deduplicateFacts,
} from "./memory/deduplication.js";
export { runEmbeddingPipeline } from "./embedding/pipeline.js";
export { EphemeralAdapter } from "./storage/ephemeral-adapter.js";
export { SupabaseAdapter } from "./storage/supabase-adapter.js";

// Adapter factories
export { createOpenAIAdapter } from "./adapters/openai.js";
export { createAnthropicAdapter } from "./adapters/anthropic.js";
export { createOllamaAdapter } from "./adapters/ollama.js";

// Backward compatibility
export { EphemeralAdapter as InMemoryAdapter } from "./storage/ephemeral-adapter.js";

export type * from "./types.js";
