import {
  Vitamem,
  VitamemConfig,
  Thread,
  MemoryMatch,
  LLMAdapter,
  StorageAdapter,
  UserProfile,
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

/**
 * Format a UserProfile as a structured text summary for LLM context injection.
 */
function formatProfileContext(profile: UserProfile): string {
  const lines: string[] = [];

  if (profile.conditions.length > 0) {
    lines.push(`Conditions: ${profile.conditions.join(", ")}`);
  }
  if (profile.medications.length > 0) {
    const meds = profile.medications.map((m) => {
      let s = m.name;
      if (m.dosage) s += ` ${m.dosage}`;
      if (m.frequency) s += ` (${m.frequency})`;
      return s;
    });
    lines.push(`Medications: ${meds.join(", ")}`);
  }
  if (profile.allergies.length > 0) {
    lines.push(`Allergies: ${profile.allergies.join(", ")}`);
  }
  if (Object.keys(profile.vitals).length > 0) {
    const vitals = Object.entries(profile.vitals).map(([key, v]) => {
      let s = `${key}: ${v.value}${v.unit}`;
      if (v.previousValue !== undefined) s += ` (previous: ${v.previousValue}${v.unit})`;
      return s;
    });
    lines.push(`Vitals: ${vitals.join(", ")}`);
  }
  if (profile.goals.length > 0) {
    lines.push(`Goals: ${profile.goals.join(", ")}`);
  }
  if (profile.emergencyContacts.length > 0) {
    lines.push(`Emergency contacts: ${profile.emergencyContacts.join(", ")}`);
  }

  return lines.length > 0 ? `Patient Profile:\n${lines.join("\n")}` : "";
}

/**
 * Best-effort filter: suppress memory matches whose content mentions a metric
 * that is already tracked in the profile with a different value.
 */
function suppressStaleMemories(results: MemoryMatch[], profile: UserProfile): MemoryMatch[] {
  if (Object.keys(profile.vitals).length === 0) return results;

  return results.filter((r) => {
    const content = r.content.toLowerCase();
    for (const [key, vital] of Object.entries(profile.vitals)) {
      const normalizedKey = key.replace(/_/g, " ").toLowerCase();
      // Check if content mentions this metric keyword
      if (!content.includes(normalizedKey) && !content.includes(key.toLowerCase())) {
        continue;
      }
      // Content mentions this metric — check if the value matches
      const profileValueStr = String(vital.value);
      if (!content.includes(profileValueStr)) {
        // Memory mentions the metric but with a different value → suppress
        return false;
      }
    }
    return true;
  });
}

interface RetrievalPipelineResult {
  memories: MemoryMatch[];
  profile: UserProfile | null;
}
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
        extractionModel: config.extractionModel,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
        apiMode: config.apiMode,
        extraChatOptions: config.extraChatOptions,
        extraEmbeddingOptions: config.extraEmbeddingOptions,
        extractionPrompt: config.extractionPrompt,
      });
    }
    case "anthropic": {
      const { createAnthropicAdapter } = await import(
        "../adapters/anthropic.js"
      );
      return createAnthropicAdapter({
        apiKey: config.apiKey!,
        chatModel: config.model,
        extractionModel: config.extractionModel,
        embeddingApiKey: config.apiKey!,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
        extractionPrompt: config.extractionPrompt,
      });
    }
    case "ollama": {
      const { createOllamaAdapter } = await import("../adapters/ollama.js");
      return createOllamaAdapter({
        chatModel: config.model,
        extractionModel: config.extractionModel,
        embeddingModel: config.embeddingModel,
        baseUrl: config.baseUrl,
        extractionPrompt: config.extractionPrompt,
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
  const deduplicationThreshold = config.deduplicationThreshold ?? 0.92;
  const supersedeThreshold = config.supersedeThreshold ?? 0.75;
  const autoPinRules = config.autoPinRules ?? [];
  const structuredRules = config.structuredExtractionRules;
  const autoRetrieve = config.autoRetrieve ?? false;
  const minScore = config.minScore ?? 0;
  const recencyWeight = config.recencyWeight ?? 0;
  const recencyMaxAgeMs = config.recencyMaxAgeMs ?? 90 * 24 * 60 * 60 * 1000;
  const diversityWeight = config.diversityWeight ?? 0;
  const onRetrieve = config.onRetrieve;
  const memoryContextFormatter = config.memoryContextFormatter;

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
  ): Promise<RetrievalPipelineResult> {
    // 0. Profile lookup (if storage supports it)
    let profile: UserProfile | null = null;
    if (storage.getProfile) {
      try {
        profile = await storage.getProfile(userId);
      } catch (err) {
        console.warn('[vitamem:retrieval] Profile lookup failed:', err);
      }
    }

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

    // 5. Suppress stale memories that contradict profile data
    if (profile) {
      vectorResults = suppressStaleMemories(vectorResults, profile);
    }

    // 6. Apply recency weighting (if recencyWeight > 0)
    if (recencyWeight > 0) {
      vectorResults = applyRecencyWeighting(vectorResults, recencyWeight, recencyMaxAgeMs);
    }

    // 7. Apply MMR diversity (if diversityWeight > 0)
    if (diversityWeight > 0) {
      vectorResults = applyMMR(vectorResults, diversityWeight, limit);
    }

    // 8. Merge: pinned first, then vector results
    let results = [...pinnedMatches, ...vectorResults];

    // 9. Pass through onRetrieve hook
    if (onRetrieve) {
      results = await onRetrieve(results, query ?? "");
    }

    return { memories: results, profile };
  }

  const api: Vitamem = {
    async createThread({ userId }) {
      return storage.createThread(userId);
    },

    async chat({ threadId, message, systemPrompt }) {
      const thread = await storage.getThread(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      // Dormant/closed thread guard: auto-create new thread and redirect
      if (thread.state === "dormant" || thread.state === "closed") {
        const newThread = await storage.createThread(thread.userId);
        const result = await api.chat({ threadId: newThread.id, message, systemPrompt });
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
        const pipelineResult = await runRetrievalPipeline(
          current.userId,
          queryEmbedding,
          10,
          undefined,
          message,
        );
        retrievedMemories = pipelineResult.memories;

        // Inject profile context as the FIRST system message
        if (pipelineResult.profile) {
          const profileText = formatProfileContext(pipelineResult.profile);
          if (profileText) {
            chatMessages.push({ role: "system", content: profileText });
          }
        }

        if (retrievedMemories.length > 0) {
          const defaultFormatter = (memories: MemoryMatch[]) =>
            `Relevant context from previous sessions:\n${memories.map((m) => `- ${m.content} (${m.source})`).join("\n")}`;
          const formatter = memoryContextFormatter ?? defaultFormatter;
          chatMessages.push({
            role: "system",
            content: formatter(retrievedMemories, message),
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
      const result = await runRetrievalPipeline(userId, queryEmbedding, limit, filterTags, query);
      return result.memories;
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
      const pipelineResult = await runEmbeddingPipeline(
        current,
        messages,
        llm,
        storage,
        deduplicationThreshold,
        supersedeThreshold,
        embeddingConcurrency,
        autoPinRules,
        structuredRules,
      );
      return pipelineResult;
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
            deduplicationThreshold,
            supersedeThreshold,
            embeddingConcurrency,
            autoPinRules,
            structuredRules,
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

    async chatStream({ threadId, message, systemPrompt }) {
      const thread = await storage.getThread(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      // Dormant/closed thread guard: auto-create new thread and redirect
      if (thread.state === "dormant" || thread.state === "closed") {
        const newThread = await storage.createThread(thread.userId);
        const result = await api.chatStream({ threadId: newThread.id, message, systemPrompt });
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
        const pipelineResult = await runRetrievalPipeline(
          current.userId,
          queryEmbedding,
          10,
          undefined,
          message,
        );
        retrievedMemories = pipelineResult.memories;

        // Inject profile context as the FIRST system message
        if (pipelineResult.profile) {
          const profileText = formatProfileContext(pipelineResult.profile);
          if (profileText) {
            chatMessages.push({ role: "system", content: profileText });
          }
        }

        if (retrievedMemories.length > 0) {
          const defaultFormatter = (memories: MemoryMatch[]) =>
            `Relevant context from previous sessions:\n${memories.map((m) => `- ${m.content} (${m.source})`).join("\n")}`;
          const formatter = memoryContextFormatter ?? defaultFormatter;
          chatMessages.push({
            role: "system",
            content: formatter(retrievedMemories, message),
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

      const onComplete = async (fullText: string) => {
        await storage.addMessage(threadId, "assistant", fullText);
        current = {
          ...current,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        };
        await storage.updateThread(current);
      };

      // Fallback: if adapter doesn't support streaming
      if (!llm.chatStream) {
        const reply = await llm.chat(chatMessages);
        await onComplete(reply);
        const stream = (async function* () { yield reply; })();
        return { stream, thread: current, memories: retrievedMemories };
      }

      const gen = llm.chatStream(chatMessages);
      const stream = (async function* () {
        let full = "";
        for await (const chunk of gen) {
          full += chunk;
          yield chunk;
        }
        await onComplete(full);
      })();

      return { stream, thread: current, memories: retrievedMemories };
    },

    async chatWithUser({ userId, message, systemPrompt }) {
      const thread = await api.getOrCreateThread(userId);
      return api.chat({ threadId: thread.id, message, systemPrompt });
    },

    async chatWithUserStream({ userId, message, systemPrompt }) {
      const thread = await api.getOrCreateThread(userId);
      return api.chatStream({ threadId: thread.id, message, systemPrompt });
    },

    /** Get a user's structured profile. Returns null if profile storage is not supported or no profile exists. */
    async getProfile(userId: string): Promise<UserProfile | null> {
      if (!storage.getProfile) return null;
      return storage.getProfile(userId);
    },

    /** Update a user's structured profile (merge semantics). No-op if profile storage is not supported. */
    async updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId">>): Promise<void> {
      if (!storage.updateProfile) {
        console.warn('[vitamem] updateProfile called but storage adapter does not support profiles');
        return;
      }
      await storage.updateProfile(userId, updates);
    },
  };

  return api;
}
