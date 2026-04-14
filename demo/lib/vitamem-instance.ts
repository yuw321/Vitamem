import {
  createVitamem,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOllamaAdapter,
  EphemeralAdapter,
  HEALTH_AUTO_PIN_RULES,
  HEALTH_STRUCTURED_RULES,
} from "vitamem";
import type { Vitamem, VitamemConfig, PresetName, ProviderName, StorageAdapter } from "vitamem";

// Store the current config so we can patch and recreate
let currentConfig: VitamemConfig;

// ---------------------------------------------------------------------------
// Singleton – attached to globalThis to survive Next.js dev-mode hot-reloads
// ---------------------------------------------------------------------------

const globalForVitamem = globalThis as unknown as {
  vitamemInstance?: Vitamem;
  vitamemPromise?: Promise<Vitamem>;
  vitamemStorage?: StorageAdapter;
};

/** Safely parse a JSON env var, returning undefined on failure. */
function safeJsonParse(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function buildConfig(): VitamemConfig {
  const provider = (process.env.LLM_PROVIDER ?? "openai") as ProviderName;

  // Build the LLM adapter based on provider
  let llm;
  switch (provider) {
    case "openai": {
      llm = createOpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY ?? "",
        chatModel: process.env.OPENAI_CHAT_MODEL,
        extractionModel: process.env.EXTRACTION_MODEL,
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
        baseUrl: process.env.OPENAI_BASE_URL,
        apiMode: (process.env.OPENAI_API_MODE as 'completions' | 'responses') || undefined,
        extraChatOptions: safeJsonParse(process.env.OPENAI_EXTRA_CHAT_OPTIONS),
        extraEmbeddingOptions: safeJsonParse(process.env.OPENAI_EXTRA_EMBEDDING_OPTIONS),
      });
      break;
    }
    case "anthropic": {
      llm = createAnthropicAdapter({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        chatModel: process.env.ANTHROPIC_CHAT_MODEL,
        extractionModel: process.env.EXTRACTION_MODEL,
        embeddingApiKey: process.env.ANTHROPIC_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
        embeddingModel: process.env.ANTHROPIC_EMBEDDING_MODEL,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      });
      break;
    }
    case "ollama": {
      llm = createOllamaAdapter({
        chatModel: process.env.OLLAMA_CHAT_MODEL,
        extractionModel: process.env.EXTRACTION_MODEL,
        embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
        baseUrl: process.env.OLLAMA_BASE_URL,
      });
      break;
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }

  // Resolve preset
  const preset = (process.env.PRESET as PresetName) || undefined;

  // Create storage adapter explicitly so we can expose it
  const storage = new EphemeralAdapter();
  globalForVitamem.vitamemStorage = storage;

  // Build full config
  const config: VitamemConfig = {
    llm,
    storage,
    preset,
    coolingTimeoutMs: process.env.COOLING_TIMEOUT_MS
      ? Number(process.env.COOLING_TIMEOUT_MS)
      : undefined,
    dormantTimeoutMs: process.env.DORMANT_TIMEOUT_MS
      ? Number(process.env.DORMANT_TIMEOUT_MS)
      : undefined,
    closedTimeoutMs: process.env.CLOSED_TIMEOUT_MS
      ? Number(process.env.CLOSED_TIMEOUT_MS)
      : undefined,
    autoRetrieve: process.env.AUTO_RETRIEVE === "true",
    minScore: process.env.MIN_SCORE
      ? Number(process.env.MIN_SCORE)
      : undefined,
    recencyWeight: process.env.RECENCY_WEIGHT
      ? Number(process.env.RECENCY_WEIGHT)
      : undefined,
    diversityWeight: process.env.DIVERSITY_WEIGHT
      ? Number(process.env.DIVERSITY_WEIGHT)
      : undefined,
    autoPinRules: process.env.AUTO_PIN === "true"
      ? HEALTH_AUTO_PIN_RULES
      : undefined,
    deduplicationThreshold: process.env.DEDUPLICATION_THRESHOLD
      ? Number(process.env.DEDUPLICATION_THRESHOLD)
      : undefined,
    supersedeThreshold: process.env.SUPERSEDE_THRESHOLD
      ? Number(process.env.SUPERSEDE_THRESHOLD)
      : undefined,
    structuredExtractionRules: HEALTH_STRUCTURED_RULES,

    // Phase 1 features
    enableReflection: true,
    forgetting: { forgettingHalfLifeMs: 180 * 86400000, minRetrievalScore: 0.1 },
    prioritySignaling: true,
    chronologicalRetrieval: true,
    cacheableContext: true,
  };

  currentConfig = config;
  return config;
}

/**
 * Returns the shared Vitamem singleton (creates on first call).
 */
export async function getVitamem(): Promise<Vitamem> {
  if (globalForVitamem.vitamemInstance) return globalForVitamem.vitamemInstance;
  if (!globalForVitamem.vitamemPromise) {
    globalForVitamem.vitamemPromise = createVitamem(buildConfig()).then((v) => {
      globalForVitamem.vitamemInstance = v;
      return v;
    });
  }
  return globalForVitamem.vitamemPromise;
}

/**
 * Returns the demo user ID from env (or default).
 */
export function getDemoUserId(): string {
  return process.env.DEMO_USER_ID || "demo-user";
}

/**
 * Returns the underlying storage adapter (available after getVitamem() resolves).
 */
export function getStorage(): StorageAdapter {
  if (!globalForVitamem.vitamemStorage) {
    throw new Error("Storage adapter not initialized. Call getVitamem() first.");
  }
  return globalForVitamem.vitamemStorage;
}

/**
 * Returns the current configuration for the config sidebar.
 */
export function getConfig() {
  const provider = (process.env.LLM_PROVIDER ?? "openai") as ProviderName;
  return {
    provider,
    preset: process.env.PRESET || "on-demand",
    apiMode: process.env.OPENAI_API_MODE || "completions",
    autoRetrieve: process.env.AUTO_RETRIEVE === "true",
    minScore: process.env.MIN_SCORE ? Number(process.env.MIN_SCORE) : 0,
    recencyWeight: process.env.RECENCY_WEIGHT ? Number(process.env.RECENCY_WEIGHT) : 0,
    diversityWeight: process.env.DIVERSITY_WEIGHT ? Number(process.env.DIVERSITY_WEIGHT) : 0,
    coolingTimeoutMs: process.env.COOLING_TIMEOUT_MS
      ? Number(process.env.COOLING_TIMEOUT_MS)
      : null,
    dormantTimeoutMs: process.env.DORMANT_TIMEOUT_MS
      ? Number(process.env.DORMANT_TIMEOUT_MS)
      : null,
    closedTimeoutMs: process.env.CLOSED_TIMEOUT_MS
      ? Number(process.env.CLOSED_TIMEOUT_MS)
      : null,
    demoUserId: getDemoUserId(),
    // Phase 1 feature flags
    enableReflection: currentConfig?.enableReflection ?? true,
    forgetting: currentConfig?.forgetting ?? { forgettingHalfLifeMs: 180 * 86400000, minRetrievalScore: 0.1 },
    prioritySignaling: currentConfig?.prioritySignaling ?? true,
    chronologicalRetrieval: currentConfig?.chronologicalRetrieval ?? true,
    cacheableContext: currentConfig?.cacheableContext ?? true,
  };
}

/**
 * Patches the current Vitamem config and recreates the singleton instance.
 * Used by ConfigSidebar to apply runtime configuration changes.
 */
export async function updateVitamemConfig(updates: Partial<VitamemConfig>): Promise<Vitamem> {
  // Ensure we have a base config
  if (!currentConfig) {
    currentConfig = buildConfig();
  }

  // Merge updates into existing config without replacing storage
  const mergedConfig: VitamemConfig = {
    ...currentConfig,
    ...updates,
    storage: globalForVitamem.vitamemStorage ?? currentConfig.storage,
  };

  currentConfig = mergedConfig;

  const instance = await createVitamem(mergedConfig);
  globalForVitamem.vitamemInstance = instance;
  globalForVitamem.vitamemPromise = Promise.resolve(instance);

  return instance;
}
