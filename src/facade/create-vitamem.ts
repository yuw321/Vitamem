import {
  Vitamem,
  VitamemConfig,
  Thread,
  MemoryMatch,
  LLMAdapter,
  StorageAdapter,
} from "../types.js";
import { PRESETS } from "../presets.js";
import {
  transition,
  reactivate,
  shouldCool,
  shouldGoDormant,
} from "../lifecycle/state-machine.js";
import { runEmbeddingPipeline } from "../embedding/pipeline.js";
import { EphemeralAdapter } from "../storage/ephemeral-adapter.js";
import { applyRecencyWeighting, applyMMR } from "../retrieval/reranking.js";

const DEFAULT_COOLING_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_CLOSED_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_EMBEDDING_CONCURRENCY = 5;

/**
 * Resolve the LLM adapter from config.
 * If `llm` instance is provided, use it directly.
 * If `provider` string is provided, dynamically import the adapter factory.
 */
async function resolveLLM(config: VitamemConfig): Promise<LLMAdapter> {
  if (config.llm) return config.llm;

  if (!config.provider) {
    throw new Error(
      "Vitamem config requires either `llm` (adapter instance) or `provider` (string shortcut).",
    );
  }

  if (!config.apiKey && config.provider !== "ollama") {
    throw new Error(
      `Vitamem config requires \`apiKey\` when using provider "${config.provider}".`,
    );
  }

  switch (config.provider) {
    case "openai": {
      const { createOpenAIAdapter } = await import("../adapters/openai.js");
      return createOpenAIAdapter({
        apiKey: config.apiKey!,
        chatModel: config.model,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
      });
    }
    case "anthropic": {
      const { createAnthropicAdapter } = await import(
        "../adapters/anthropic.js"
      );
      return createAnthropicAdapter({
        apiKey: config.apiKey!,
        chatModel: config.model,
        embeddingApiKey: config.apiKey!,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
      });
    }
    case "ollama": {
      const { createOllamaAdapter } = await import("../adapters/ollama.js");
      return createOllamaAdapter({
        chatModel: config.model,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
      });
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Resolve the storage adapter from config.
 */
async function resolveStorage(config: VitamemConfig): Promise<StorageAdapter> {
  if (typeof config.storage !== "string") return config.storage;

  switch (config.storage) {
    case "ephemeral":
      return new EphemeralAdapter();
    case "supabase": {
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error(
          'Vitamem config requires `supabaseUrl` and `supabaseKey` when using storage: "supabase".',
        );
      }
      const { SupabaseAdapter } = await import(
        "../storage/supabase-adapter.js"
      );
      // Dynamic import to avoid hard dependency on @supabase/supabase-js
      const supabase = await import("@supabase/supabase-js");
      const client = supabase.createClient(
        config.supabaseUrl,
        config.supabaseKey,
      );
      // Cast to our minimal SupabaseClient interface
      return new SupabaseAdapter(client as any);
    }
    default:
      throw new Error(`Unknown storage: ${config.storage}`);
  }
}

/**
 * Create a Vitamem instance — the main entry point for the library.
 */
export async function createVitamem(config: VitamemConfig): Promise<Vitamem> {
  // Resolve preset values (explicit config values override preset)
  if (config.preset) {
    const preset = PRESETS[config.preset];
    config = {
      ...config,
      coolingTimeoutMs: config.coolingTimeoutMs ?? preset.coolingTimeoutMs,
      dormantTimeoutMs: config.dormantTimeoutMs ?? preset.dormantTimeoutMs,
      closedTimeoutMs: config.closedTimeoutMs ?? preset.closedTimeoutMs,
    };
  }

  const llm = await resolveLLM(config);
  const storage = await resolveStorage(config);
  const coolingTimeoutMs =
    config.coolingTimeoutMs ?? DEFAULT_COOLING_TIMEOUT_MS;
  const dormantTimeoutMs =
    config.dormantTimeoutMs ?? coolingTimeoutMs;
  const closedTimeoutMs =
    config.closedTimeoutMs ?? DEFAULT_CLOSED_TIMEOUT_MS;
  const embeddingConcurrency =
    config.embeddingConcurrency ?? DEFAULT_EMBEDDING_CONCURRENCY;
  const autoRetrieve = config.autoRetrieve ?? false;
  const minScore = config.minScore ?? 0;
  const recencyWeight = config.recencyWeight ?? 0;
  const recencyMaxAgeMs = config.recencyMaxAgeMs ?? 90 * 24 * 60 * 60 * 1000;
  const diversityWeight = config.diversityWeight ?? 0;
  const onRetrieve = config.onRetrieve;

  /**
   * Full retrieval pipeline:
   * 1. getPinnedMemories(userId)
   * 2. searchMemories(userId, embedding) with optional filterTags
   * 3. Remove from vectorResults any that match pinned by id
   * 4. Apply minScore filter to vectorResults
   * 5. Apply recency weighting (if recencyWeight > 0)
   * 6. Apply MMR (if diversityWeight > 0)
   * 7. Merge: [...pinned, ...vectorResults]
   * 8. Pass through onRetrieve hook (if provided)
   * 9. Return final results
   */
  async function runRetrievalPipeline(
    userId: string,
    embedding: number[],
    limit: number = 10,
    filterTags?: string[],
    query?: string,
  ): Promise<MemoryMatch[]> {
    // 1. Get pinned memories
    let pinnedMatches: MemoryMatch[] = [];
    if (storage.getPinnedMemories) {
      const pinned = await storage.getPinnedMemories(userId);
      pinnedMatches = pinned.map((m) => ({
        content: m.content,
        source: m.source,
        score: 1.0, // pinned always have max relevance
        id: m.id,
        createdAt: m.createdAt,
        pinned: true,
        tags: m.tags,
        embedding: m.embedding ?? undefined,
      }));
    }

    // 2. Vector search with optional tag filtering
    // When MMR is active, fetch more candidates to allow diversity selection
    const searchLimit = diversityWeight > 0 ? limit * 5 : limit;
    let vectorResults = await storage.searchMemories(
      userId,
      embedding,
      searchLimit,
      filterTags,
    );

    // 3. Remove from vectorResults any that match pinned by id
    const pinnedIds = new Set(pinnedMatches.map((m) => m.id).filter(Boolean));
    if (pinnedIds.size > 0) {
      vectorResults = vectorResults.filter((r) => !r.id || !pinnedIds.has(r.id));
    }

    // 4. Apply minScore filter (only on non-pinned results)
    if (minScore > 0) {
      vectorResults = vectorResults.filter((r) => r.score >= minScore);
    }

    // 5. Apply recency weighting (if recencyWeight > 0)
    if (recencyWeight > 0) {
      vectorResults = applyRecencyWeighting(vectorResults, recencyWeight, recencyMaxAgeMs);
    }

    // 6. Apply MMR diversity (if diversityWeight > 0)
    if (diversityWeight > 0) {
      vectorResults = applyMMR(vectorResults, diversityWeight, limit);
    }

    // 7. Merge: pinned first, then vector results
    let results = [...pinnedMatches, ...vectorResults];

    // 8. Pass through onRetrieve hook
    if (onRetrieve) {
      results = await onRetrieve(results, query ?? "");
    }

    return results;
  }

  return {
    async createThread({ userId }) {
      return storage.createThread(userId);
    },

    async chat({ threadId, message, systemPrompt }) {
      const thread = await storage.getThread(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      // Dormant/closed thread guard: auto-create new thread and redirect
      if (thread.state === "dormant" || thread.state === "closed") {
        const newThread = await storage.createThread(thread.userId);
        const result = await this.chat({ threadId: newThread.id, message, systemPrompt });
        return { ...result, thread: newThread, previousThreadId: thread.id, redirected: true };
      }

      // Reactivate if cooling
      let current = thread;
      if (current.state === "cooling") {
        current = reactivate(current);
        await storage.updateThread(current);
      }

      // Add user message
      await storage.addMessage(threadId, "user", message);

      // Get all messages for context
      const messages = await storage.getMessages(threadId);
      const chatMessages: Array<{ role: string; content: string }> = [];

      // Auto-retrieve: embed the user message, search memories, inject as system message
      let retrievedMemories: MemoryMatch[] | undefined;
      if (autoRetrieve) {
        const queryEmbedding = await llm.embed(message);
        retrievedMemories = await runRetrievalPipeline(
          current.userId,
          queryEmbedding,
          10,
          undefined,
          message,
        );
        if (retrievedMemories.length > 0) {
          const memoryContext = retrievedMemories
            .map((m) => `- ${m.content} (${m.source})`)
            .join("\n");
          chatMessages.push({
            role: "system",
            content: `Relevant context from previous sessions:\n${memoryContext}`,
          });
        }
      }

      // Inject custom system prompt if provided
      if (systemPrompt) {
        chatMessages.push({ role: "system", content: systemPrompt });
      }

      // Add conversation messages
      chatMessages.push(
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      );

      // Get LLM reply
      const reply = await llm.chat(chatMessages);

      // Add assistant message
      await storage.addMessage(threadId, "assistant", reply);

      // Update thread timestamp
      current = {
        ...current,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      };
      await storage.updateThread(current);

      return { reply, thread: current, memories: retrievedMemories };
    },

    async retrieve({ userId, query, limit, filterTags }) {
      const queryEmbedding = await llm.embed(query);
      return runRetrievalPipeline(userId, queryEmbedding, limit, filterTags, query);
    },

    async getThread(threadId) {
      return storage.getThread(threadId);
    },

    async pinMemory(memoryId) {
      if (!storage.updateMemory) {
        throw new Error(
          "pinMemory() requires a storage adapter that implements updateMemory().",
        );
      }
      await storage.updateMemory(memoryId, { pinned: true });
    },

    async unpinMemory(memoryId) {
      if (!storage.updateMemory) {
        throw new Error(
          "unpinMemory() requires a storage adapter that implements updateMemory().",
        );
      }
      await storage.updateMemory(memoryId, { pinned: false });
    },

    async triggerDormantTransition(threadId) {
      const thread = await storage.getThread(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      // Transition: active → cooling → dormant
      let current = thread;
      if (current.state === "active") {
        current = transition(current, "cooling");
      }
      if (current.state === "cooling") {
        current = transition(current, "dormant");
      }

      await storage.updateThread(current);

      // Run embedding pipeline
      const messages = await storage.getMessages(threadId);
      await runEmbeddingPipeline(
        current,
        messages,
        llm,
        storage,
        0.92,
        embeddingConcurrency,
      );
    },

    async closeThread(threadId) {
      const thread = await storage.getThread(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      let current = thread;
      // Must be dormant to close
      if (current.state !== "dormant") {
        throw new Error(
          `Cannot close thread in state: ${current.state}. Must be dormant.`,
        );
      }

      current = transition(current, "closed");
      await storage.updateThread(current);
    },

    async sweepThreads() {
      if (!storage.getThreadsByState) {
        throw new Error(
          "sweepThreads() requires a storage adapter that implements getThreadsByState().",
        );
      }

      // Active → Cooling
      const activeThreads = await storage.getThreadsByState("active");
      for (const thread of activeThreads) {
        if (shouldCool(thread, coolingTimeoutMs)) {
          const cooled = transition(thread, "cooling");
          await storage.updateThread(cooled);
        }
      }

      // Cooling → Dormant (run embedding pipeline)
      const coolingThreads = await storage.getThreadsByState("cooling");
      for (const thread of coolingThreads) {
        if (shouldGoDormant(thread, dormantTimeoutMs)) {
          const dormant = transition(thread, "dormant");
          await storage.updateThread(dormant);

          const messages = await storage.getMessages(thread.id);
          await runEmbeddingPipeline(
            dormant,
            messages,
            llm,
            storage,
            0.92,
            embeddingConcurrency,
          );
        }
      }

      // Dormant → Closed
      const dormantThreads = await storage.getThreadsByState("dormant");
      for (const thread of dormantThreads) {
        if (
          thread.dormantAt &&
          Date.now() - thread.dormantAt.getTime() >= closedTimeoutMs
        ) {
          const closed = transition(thread, "closed");
          await storage.updateThread(closed);
        }
      }
    },

    async deleteMemory(memoryId) {
      if (!storage.deleteMemory) {
        throw new Error(
          "deleteMemory() requires a storage adapter that implements deleteMemory().",
        );
      }
      await storage.deleteMemory(memoryId);
    },

    async deleteUserData(userId) {
      if (!storage.deleteUserMemories) {
        throw new Error(
          "deleteUserData() requires a storage adapter that implements deleteUserMemories().",
        );
      }
      await storage.deleteUserMemories(userId);
    },

    async getOrCreateThread(userId) {
      if (storage.getLatestActiveThread) {
        const existing = await storage.getLatestActiveThread(userId);
        if (existing) {
          if (existing.state === "cooling") {
            const reactivated = reactivate(existing);
            await storage.updateThread(reactivated);
            return reactivated;
          }
          return existing;
        }
      }
      return storage.createThread(userId);
    },

    async chatWithUser({ userId, message, systemPrompt }) {
      const thread = await this.getOrCreateThread(userId);
      return this.chat({ threadId: thread.id, message, systemPrompt });
    },
  };
}
