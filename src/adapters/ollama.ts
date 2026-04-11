import type { LLMAdapter } from "../types.js";
import { createOpenAIAdapter } from "./openai.js";

export interface OllamaAdapterOptions {
  chatModel?: string;
  extractionModel?: string;
  embeddingModel?: string;
  baseUrl?: string;
  extractionPrompt?: string;
  /** Pass-through options for chat/completion calls. */
  extraChatOptions?: Record<string, unknown>;
  /** Pass-through options for embedding calls. */
  extraEmbeddingOptions?: Record<string, unknown>;
}

const DEFAULT_CHAT_MODEL = "llama3.2";
const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
const DEFAULT_BASE_URL = "http://localhost:11434/v1";

/**
 * Create an LLM adapter for Ollama (local models).
 *
 * Ollama implements the OpenAI-compatible API, so this is a thin wrapper
 * around `createOpenAIAdapter` with local defaults.
 *
 * Requires the `openai` npm package as a peer dependency.
 * Requires Ollama running locally (https://ollama.ai).
 *
 * Zero config by default:
 * - Chat model: llama3.2
 * - Embedding model: nomic-embed-text
 * - Base URL: http://localhost:11434/v1
 */
export function createOllamaAdapter(opts?: OllamaAdapterOptions): LLMAdapter {
  return createOpenAIAdapter({
    apiKey: "ollama", // Ollama doesn't require an API key, but the SDK needs a value
    chatModel: opts?.chatModel ?? DEFAULT_CHAT_MODEL,
    extractionModel: opts?.extractionModel,
    embeddingModel: opts?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
    baseUrl: opts?.baseUrl ?? DEFAULT_BASE_URL,
    extractionPrompt: opts?.extractionPrompt,
    extraChatOptions: opts?.extraChatOptions,
    extraEmbeddingOptions: opts?.extraEmbeddingOptions,
  });
}
