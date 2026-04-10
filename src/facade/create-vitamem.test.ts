import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVitamem } from "./create-vitamem.js";
import { Thread, Message, MemoryMatch, LLMAdapter, StorageAdapter } from "../types.js";
import { EphemeralAdapter } from "../storage/ephemeral-adapter.js";
import { PRESETS } from "../presets.js";

// ── Helpers ──

function makeLLMAdapter(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  let embedCount = 0;
  return {
    chat: vi.fn().mockImplementation(async (msgs) => {
      return `Reply to: ${msgs[msgs.length - 1]?.content ?? "nothing"}`;
    }),
    extractMemories: vi
      .fn()
      .mockResolvedValue([{ content: "Extracted fact", source: "confirmed" }]),
    embed: vi.fn().mockImplementation(async (text: string) => {
      embedCount++;
      // Deterministic embedding based on text hash
      return Array.from({ length: 3 }, (_, i) =>
        Math.sin(text.charCodeAt(i % text.length) + embedCount),
      );
    }),
    ...overrides,
  };
}

// ── createThread ──

describe("createVitamem.createThread", () => {
  it("creates a thread with the given userId", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });

    expect(thread.userId).toBe("u_123");
    expect(thread.state).toBe("active");
    expect(thread.id).toBeTruthy();
  });

  it("creates threads with unique ids", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const t1 = await mem.createThread({ userId: "u_123" });
    const t2 = await mem.createThread({ userId: "u_123" });

    expect(t1.id).not.toBe(t2.id);
  });
});

// ── chat ──

describe("createVitamem.chat", () => {
  it("sends a message and receives a reply", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    const { reply, thread: updated } = await mem.chat({
      threadId: thread.id,
      message: "Hello!",
    });

    expect(reply).toContain("Reply to: Hello!");
    expect(llm.chat).toHaveBeenCalled();
  });

  it("stores user and assistant messages", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: thread.id, message: "Hello!" });

    const messages = await storage.getMessages(thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello!");
    expect(messages[1].role).toBe("assistant");
  });

  it("throws for non-existent thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    await expect(
      mem.chat({ threadId: "nonexistent", message: "Hi" }),
    ).rejects.toThrow("Thread not found");
  });

  it("reactivates a cooling thread on new message", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });

    // Manually set thread to cooling
    const coolingThread: Thread = {
      ...thread,
      state: "cooling",
      coolingStartedAt: new Date(),
    };
    await storage.updateThread(coolingThread);

    const { thread: updated } = await mem.chat({
      threadId: thread.id,
      message: "I am back!",
    });

    expect(updated.state).toBe("active");
    expect(updated.coolingStartedAt).toBeNull();
  });

  it("updates lastMessageAt after chat", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });
    expect(thread.lastMessageAt).toBeNull();

    const { thread: updated } = await mem.chat({
      threadId: thread.id,
      message: "Hello!",
    });

    expect(updated.lastMessageAt).toBeInstanceOf(Date);
  });

  it("accumulates message context across multiple chats", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: thread.id, message: "First message" });
    await mem.chat({ threadId: thread.id, message: "Second message" });

    // The second chat call should include all prior messages
    const lastCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(lastCall.length).toBe(3); // user, assistant, user
  });

  it("injects systemPrompt when provided", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.chat({
      threadId: thread.id,
      message: "Hello!",
      systemPrompt: "You are a health companion.",
    });

    const chatCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemMsg = chatCall.find(
      (m: { role: string }) => m.role === "system",
    );
    expect(systemMsg).toBeTruthy();
    expect(systemMsg.content).toBe("You are a health companion.");
  });
});

// ── retrieve ──

describe("createVitamem.retrieve", () => {
  it("embeds the query and searches memories", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    // Seed a memory directly
    await storage.saveMemory({
      userId: "u_123",
      threadId: "thread-1",
      content: "Prefers TypeScript",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    const results = await mem.retrieve({
      userId: "u_123",
      query: "language preferences",
    });

    expect(llm.embed).toHaveBeenCalledWith("language preferences");
    // Results depend on embedding similarity
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns empty array when no memories exist", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const results = await mem.retrieve({
      userId: "u_123",
      query: "anything",
    });

    expect(results).toEqual([]);
  });
});

// ── triggerDormantTransition ──

describe("createVitamem.triggerDormantTransition", () => {
  it("transitions an active thread to dormant and runs embedding pipeline", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      extractMemories: vi
        .fn()
        .mockResolvedValue([
          { content: "Prefers TypeScript", source: "confirmed" },
        ]),
    });
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: thread.id, message: "I prefer TypeScript." });

    await mem.triggerDormantTransition(thread.id);

    const updated = await mem.getThread(thread.id);
    expect(updated!.state).toBe("dormant");
    expect(updated!.dormantAt).toBeInstanceOf(Date);

    // Should have extracted memories
    expect(llm.extractMemories).toHaveBeenCalled();

    // Should have saved memories
    const memories = await storage.getMemories("u_123");
    expect(memories.length).toBeGreaterThan(0);
  });

  it("throws for non-existent thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    await expect(mem.triggerDormantTransition("nonexistent")).rejects.toThrow(
      "Thread not found",
    );
  });

  it("embeds extracted facts at dormant transition time, not before", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      extractMemories: vi
        .fn()
        .mockResolvedValue([{ content: "A fact", source: "confirmed" }]),
    });
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: thread.id, message: "Some info" });

    // embed should not have been called during chat
    expect(llm.embed).not.toHaveBeenCalled();

    // Now trigger dormant — embed should be called
    await mem.triggerDormantTransition(thread.id);
    expect(llm.embed).toHaveBeenCalled();
  });
});

// ── closeThread ──

describe("createVitamem.closeThread", () => {
  it("closes a dormant thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.triggerDormantTransition(thread.id);

    await mem.closeThread(thread.id);

    const updated = await mem.getThread(thread.id);
    expect(updated!.state).toBe("closed");
    expect(updated!.closedAt).toBeInstanceOf(Date);
  });

  it("throws when trying to close non-dormant thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    const thread = await mem.createThread({ userId: "u_123" });

    await expect(mem.closeThread(thread.id)).rejects.toThrow("Must be dormant");
  });

  it("throws for non-existent thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
    });

    await expect(mem.closeThread("nonexistent")).rejects.toThrow(
      "Thread not found",
    );
  });
});

// ── deleteMemory / deleteUserData ──

describe("createVitamem.deleteMemory", () => {
  it("deletes a specific memory", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const saved = await storage.saveMemory({
      userId: "u_123",
      threadId: "t-1",
      content: "A fact",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    await mem.deleteMemory(saved.id);

    const remaining = await storage.getMemories("u_123");
    expect(remaining).toHaveLength(0);
  });

  it("deleteUserData removes all user memories", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await storage.saveMemory({
      userId: "u_123",
      threadId: "t-1",
      content: "Fact 1",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    await storage.saveMemory({
      userId: "u_123",
      threadId: "t-2",
      content: "Fact 2",
      source: "confirmed",
      embedding: [0, 1, 0],
    });

    await mem.deleteUserData("u_123");

    const remaining = await storage.getMemories("u_123");
    expect(remaining).toHaveLength(0);
  });
});

// ── autoRetrieve ──

describe("createVitamem.autoRetrieve", () => {
  it("injects memories into chat context when enabled", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage, autoRetrieve: true });

    // Seed a memory
    await storage.saveMemory({
      userId: "u_123",
      threadId: "t-1",
      content: "Has Type 2 diabetes",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    const thread = await mem.createThread({ userId: "u_123" });
    const { memories } = await mem.chat({
      threadId: thread.id,
      message: "How are my health conditions?",
    });

    // Should have retrieved memories
    expect(memories).toBeDefined();
    expect(memories!.length).toBeGreaterThan(0);
    expect(memories![0].content).toBe("Has Type 2 diabetes");

    // Should have injected a system message with memory context
    const chatCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemMsg = chatCall.find(
      (m: { role: string; content: string }) =>
        m.role === "system" && m.content.includes("previous sessions"),
    );
    expect(systemMsg).toBeTruthy();
  });

  it("does not inject memories when disabled (default)", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_123" });
    const { memories } = await mem.chat({
      threadId: thread.id,
      message: "Hello",
    });

    expect(memories).toBeUndefined();
  });
});

// ── sweepThreads ──

describe("createVitamem.sweepThreads", () => {
  it("transitions active threads to cooling after timeout", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
      coolingTimeoutMs: 100, // 100ms for testing
    });

    const thread = await mem.createThread({ userId: "u_123" });
    // Set lastMessageAt to past
    const old: Thread = {
      ...thread,
      lastMessageAt: new Date(Date.now() - 200),
    };
    await storage.updateThread(old);

    await mem.sweepThreads();

    const updated = await storage.getThread(thread.id);
    expect(updated!.state).toBe("cooling");
  });

  it("transitions dormant threads to closed after timeout", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
      closedTimeoutMs: 100, // 100ms for testing
    });

    const thread = await mem.createThread({ userId: "u_123" });
    // Set to dormant with dormantAt in the past
    const dormant: Thread = {
      ...thread,
      state: "dormant",
      dormantAt: new Date(Date.now() - 200),
    };
    await storage.updateThread(dormant);

    await mem.sweepThreads();

    const updated = await storage.getThread(thread.id);
    expect(updated!.state).toBe("closed");
  });
});

// ── Full integration: create → chat → extract → retrieve ──

describe("full facade integration", () => {
  it("create thread → chat → dormant → retrieve memories", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: "Prefers TypeScript", source: "confirmed" },
        { content: "Works in fintech", source: "confirmed" },
      ]),
      embed: vi.fn().mockImplementation(async (text: string) => {
        // Return different embeddings per content
        if (text.includes("TypeScript")) return [1, 0, 0];
        if (text.includes("fintech")) return [0, 1, 0];
        if (text.includes("language")) return [0.9, 0.1, 0]; // similar to TypeScript
        return [0.3, 0.3, 0.3];
      }),
    });

    const mem = await createVitamem({ llm, storage });

    // 1. Create thread
    const thread = await mem.createThread({ userId: "u_123" });
    expect(thread.state).toBe("active");

    // 2. Chat
    const { reply } = await mem.chat({
      threadId: thread.id,
      message: "I prefer TypeScript and work in fintech.",
    });
    expect(reply).toBeTruthy();

    // 3. Trigger dormant transition (extracts + embeds memories)
    await mem.triggerDormantTransition(thread.id);

    const dormantThread = await mem.getThread(thread.id);
    expect(dormantThread!.state).toBe("dormant");

    // 4. Retrieve memories
    const memories = await mem.retrieve({
      userId: "u_123",
      query: "language preferences",
    });

    expect(memories.length).toBeGreaterThan(0);
    // The "TypeScript" memory should rank highest for "language" query
    expect(memories[0].content).toBe("Prefers TypeScript");
    expect(memories[0].source).toBe("confirmed");
    expect(memories[0].score).toBeGreaterThan(0.8);

    // 5. Close thread
    await mem.closeThread(thread.id);
    const closedThread = await mem.getThread(thread.id);
    expect(closedThread!.state).toBe("closed");

    // Memories persist after close
    const memoriesAfterClose = await mem.retrieve({
      userId: "u_123",
      query: "language preferences",
    });
    expect(memoriesAfterClose.length).toBeGreaterThan(0);
  });

  it("multiple threads accumulate memories for the same user", async () => {
    const storage = new EphemeralAdapter();
    let factSet = 0;
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockImplementation(async () => {
        factSet++;
        if (factSet === 1)
          return [{ content: "Prefers TypeScript", source: "confirmed" }];
        return [{ content: "Lives in NYC", source: "confirmed" }];
      }),
      embed: vi.fn().mockImplementation(async (text: string) => {
        if (text.includes("TypeScript")) return [1, 0, 0];
        if (text.includes("NYC")) return [0, 1, 0];
        return [0.5, 0.5, 0];
      }),
    });

    const mem = await createVitamem({ llm, storage });

    // Thread 1
    const t1 = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: t1.id, message: "I prefer TypeScript." });
    await mem.triggerDormantTransition(t1.id);

    // Thread 2
    const t2 = await mem.createThread({ userId: "u_123" });
    await mem.chat({ threadId: t2.id, message: "I live in NYC." });
    await mem.triggerDormantTransition(t2.id);

    // Both memories should be retrievable
    const allMemories = await storage.getMemories("u_123");
    expect(allMemories).toHaveLength(2);

    const contents = allMemories.map((m) => m.content);
    expect(contents).toContain("Prefers TypeScript");
    expect(contents).toContain("Lives in NYC");
  });
});

// ── sweepThreads: cooling → dormant ──

describe("createVitamem.sweepThreads cooling→dormant", () => {
  it("transitions cooling threads to dormant and runs pipeline", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      extractMemories: vi
        .fn()
        .mockResolvedValue([
          { content: "Extracted during sweep", source: "confirmed" },
        ]),
    });
    const mem = await createVitamem({
      llm,
      storage,
      coolingTimeoutMs: 100,
    });

    const thread = await mem.createThread({ userId: "u_sweep" });
    await mem.chat({ threadId: thread.id, message: "Hello" });

    // Manually set to cooling with coolingStartedAt in the past
    const cooling: Thread = {
      ...thread,
      state: "cooling",
      lastMessageAt: new Date(Date.now() - 200),
      coolingStartedAt: new Date(Date.now() - 200),
    };
    await storage.updateThread(cooling);

    await mem.sweepThreads();

    const updated = await storage.getThread(thread.id);
    expect(updated!.state).toBe("dormant");

    // Should have run embedding pipeline
    const memories = await storage.getMemories("u_sweep");
    expect(memories.length).toBeGreaterThan(0);
  });
});

// ── delete error paths ──

describe("createVitamem delete error paths", () => {
  it("throws when deleteMemory is called on adapter without it", async () => {
    const storage = new EphemeralAdapter();
    // Remove the method to simulate an adapter that doesn't implement it
    (storage as any).deleteMemory = undefined;
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await expect(mem.deleteMemory("mem-1")).rejects.toThrow(
      "requires a storage adapter",
    );
  });

  it("throws when deleteUserData is called on adapter without it", async () => {
    const storage = new EphemeralAdapter();
    (storage as any).deleteUserMemories = undefined;
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await expect(mem.deleteUserData("u_1")).rejects.toThrow(
      "requires a storage adapter",
    );
  });

  it("throws when sweepThreads is called on adapter without getThreadsByState", async () => {
    const storage = new EphemeralAdapter();
    (storage as any).getThreadsByState = undefined;
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await expect(mem.sweepThreads()).rejects.toThrow(
      "requires a storage adapter",
    );
  });
});

// ── config validation ──

describe("createVitamem config validation", () => {
  it("throws when neither llm nor provider is specified", async () => {
    await expect(
      createVitamem({ storage: "ephemeral" } as any),
    ).rejects.toThrow("requires either");
  });

  it("throws when provider is set without apiKey (non-ollama)", async () => {
    await expect(
      createVitamem({ provider: "openai", storage: "ephemeral" }),
    ).rejects.toThrow("requires `apiKey`");
  });

  it("accepts storage string 'ephemeral'", async () => {
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage: "ephemeral" });
    const thread = await mem.createThread({ userId: "u_1" });
    expect(thread.state).toBe("active");
  });
});

// ── getOrCreateThread ──

describe("createVitamem.getOrCreateThread", () => {
  it("returns existing active thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const thread = await mem.createThread({ userId: "u_123" });
    const found = await mem.getOrCreateThread("u_123");

    expect(found.id).toBe(thread.id);
    expect(found.state).toBe("active");
  });

  it("reactivates a cooling thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const thread = await mem.createThread({ userId: "u_123" });
    const coolingThread: Thread = {
      ...thread,
      state: "cooling",
      coolingStartedAt: new Date(),
    };
    await storage.updateThread(coolingThread);

    const found = await mem.getOrCreateThread("u_123");
    expect(found.id).toBe(thread.id);
    expect(found.state).toBe("active");
  });

  it("creates new thread when none found", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const thread = await mem.getOrCreateThread("u_new");
    expect(thread.state).toBe("active");
    expect(thread.userId).toBe("u_new");
  });
});

// ── chatWithUser ──

describe("createVitamem.chatWithUser", () => {
  it("basic flow: creates thread and chats", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    const mem = await createVitamem({ llm, storage });

    const result = await mem.chatWithUser({
      userId: "u_123",
      message: "Hello!",
    });

    expect(result.reply).toContain("Reply to: Hello!");
    expect(result.thread.userId).toBe("u_123");
  });

  it("injects memories with autoRetrieve", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage, autoRetrieve: true });

    await storage.saveMemory({
      userId: "u_123",
      threadId: "t-1",
      content: "Likes running",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    const result = await mem.chatWithUser({
      userId: "u_123",
      message: "What are my hobbies?",
    });

    expect(result.memories).toBeDefined();
    expect(result.memories!.length).toBeGreaterThan(0);
  });
});

// ── dormant thread guard ──

describe("createVitamem dormant/closed thread guard", () => {
  it("auto-creates new thread when chatting on dormant thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.triggerDormantTransition(thread.id);

    const result = await mem.chat({
      threadId: thread.id,
      message: "I am back!",
    });

    expect(result.redirected).toBe(true);
    expect(result.previousThreadId).toBe(thread.id);
    expect(result.thread.id).not.toBe(thread.id);
    expect(result.thread.state).toBe("active");
    expect(result.reply).toContain("Reply to: I am back!");
  });

  it("auto-creates new thread when chatting on closed thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const thread = await mem.createThread({ userId: "u_123" });
    await mem.triggerDormantTransition(thread.id);
    await mem.closeThread(thread.id);

    const result = await mem.chat({
      threadId: thread.id,
      message: "Hello again!",
    });

    expect(result.redirected).toBe(true);
    expect(result.previousThreadId).toBe(thread.id);
    expect(result.thread.id).not.toBe(thread.id);
  });
});

// ── preset resolution ──

describe("createVitamem preset resolution", () => {
  it("applies preset values", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
      preset: "daily-checkin",
    });

    // Verify sweep uses preset coolingTimeoutMs (2 hours)
    // Create a thread with lastMessageAt 1 hour ago — should NOT cool
    const thread = await mem.createThread({ userId: "u_123" });
    const recent: Thread = {
      ...thread,
      lastMessageAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    };
    await storage.updateThread(recent);

    await mem.sweepThreads();
    const updated = await storage.getThread(thread.id);
    expect(updated!.state).toBe("active"); // 1hr < 2hr preset
  });

  it("explicit values override preset values", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({
      llm: makeLLMAdapter(),
      storage,
      preset: "daily-checkin", // coolingTimeoutMs: 2 hours
      coolingTimeoutMs: 100, // explicit override: 100ms
    });

    const thread = await mem.createThread({ userId: "u_123" });
    const old: Thread = {
      ...thread,
      lastMessageAt: new Date(Date.now() - 200),
    };
    await storage.updateThread(old);

    await mem.sweepThreads();
    const updated = await storage.getThread(thread.id);
    expect(updated!.state).toBe("cooling"); // explicit 100ms used
  });
});

// ── Tier 1: onRetrieve hook ──

describe("createVitamem.onRetrieve hook", () => {
  it("passes results through onRetrieve callback", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const onRetrieve = vi.fn().mockImplementation((memories: MemoryMatch[]) => {
      return memories.filter((m) => m.content.includes("keep"));
    });
    const mem = await createVitamem({ llm, storage, onRetrieve });

    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "keep this",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "discard this",
      source: "confirmed",
      embedding: [0.9, 0.1, 0],
    });

    const results = await mem.retrieve({ userId: "u_1", query: "test" });
    expect(onRetrieve).toHaveBeenCalled();
    expect(results.every((r) => r.content.includes("keep"))).toBe(true);
  });

  it("onRetrieve receives query string", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({ embed: vi.fn().mockResolvedValue([1, 0, 0]) });
    let capturedQuery = "";
    const onRetrieve = vi.fn().mockImplementation((memories: MemoryMatch[], query: string) => {
      capturedQuery = query;
      return memories;
    });
    const mem = await createVitamem({ llm, storage, onRetrieve });

    await mem.retrieve({ userId: "u_1", query: "my health" });
    expect(capturedQuery).toBe("my health");
  });
});

// ── Tier 1: minScore ──

describe("createVitamem.minScore", () => {
  it("filters out results below minScore", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage, minScore: 0.5 });

    // High similarity
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "High match",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    // Low similarity (orthogonal)
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Low match",
      source: "confirmed",
      embedding: [0, 1, 0],
    });

    const results = await mem.retrieve({ userId: "u_1", query: "test" });
    expect(results.every((r) => r.score >= 0.5 || r.pinned)).toBe(true);
  });

  it("returns all results when minScore is 0 (default)", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage });

    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Any match",
      source: "confirmed",
      embedding: [0, 1, 0],
    });

    const results = await mem.retrieve({ userId: "u_1", query: "test" });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Tier 2: Pinned memories ──

describe("createVitamem.pinMemory / unpinMemory", () => {
  it("pins and unpins a memory", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    const saved = await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Important allergy",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    await mem.pinMemory(saved.id);
    let pinned = await storage.getPinnedMemories!("u_1");
    expect(pinned).toHaveLength(1);
    expect(pinned[0].pinned).toBe(true);

    await mem.unpinMemory(saved.id);
    pinned = await storage.getPinnedMemories!("u_1");
    expect(pinned).toHaveLength(0);
  });

  it("pinned memories always appear in retrieval results", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([0, 1, 0]),
    });
    const mem = await createVitamem({ llm, storage, minScore: 0.99 });

    const saved = await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Pinned fact",
      source: "confirmed",
      embedding: [1, 0, 0], // orthogonal to query — would fail minScore
    });
    await mem.pinMemory(saved.id);

    const results = await mem.retrieve({ userId: "u_1", query: "anything" });
    expect(results.some((r) => r.content === "Pinned fact")).toBe(true);
  });

  it("pinned memories are not duplicated in results", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage });

    const saved = await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Unique pinned",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    await mem.pinMemory(saved.id);

    const results = await mem.retrieve({ userId: "u_1", query: "test" });
    const matching = results.filter((r) => r.content === "Unique pinned");
    expect(matching).toHaveLength(1);
  });

  it("throws when storage doesn't support updateMemory", async () => {
    const storage = new EphemeralAdapter();
    (storage as any).updateMemory = undefined;
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await expect(mem.pinMemory("mem-1")).rejects.toThrow("requires a storage adapter");
    await expect(mem.unpinMemory("mem-1")).rejects.toThrow("requires a storage adapter");
  });
});

// ── Tier 2: Recency weighting (integration) ──

describe("createVitamem.recencyWeight", () => {
  it("boosts recent memories in retrieval", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({
      llm,
      storage,
      recencyWeight: 0.8,
      recencyMaxAgeMs: 90 * 24 * 60 * 60 * 1000,
    });

    // Old memory with high similarity
    const old = await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Old high-sim",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    // Manually backdate
    await storage.updateMemory!(old.id, {
      createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000),
    });

    // Recent memory with similar embedding
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Recent sim",
      source: "confirmed",
      embedding: [0.95, 0.3, 0],
    });

    const results = await mem.retrieve({ userId: "u_1", query: "test" });
    expect(results.length).toBeGreaterThan(0);
    // Recent memory should be boosted
    expect(results[0].content).toBe("Recent sim");
  });
});

// ── Tier 3: Tag filtering ──

describe("createVitamem.filterTags", () => {
  it("filters retrieval by tags", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage });

    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Takes metformin",
      source: "confirmed",
      embedding: [1, 0, 0],
      tags: ["medication"],
    } as any);
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "Likes yoga",
      source: "confirmed",
      embedding: [0.9, 0.1, 0],
      tags: ["lifestyle"],
    } as any);

    const results = await mem.retrieve({
      userId: "u_1",
      query: "test",
      filterTags: ["medication"],
    });
    expect(results.every((r) => r.tags?.includes("medication") || r.pinned)).toBe(true);
  });
});

// ── chatStream ──

// Helper to create a mock async generator
async function* mockStreamGen(chunks: string[]): AsyncGenerator<string, void, unknown> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("createVitamem.chatStream", () => {
  it("yields chunks and saves complete message", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      chatStream: (_messages) => mockStreamGen(["Hello", " ", "world"]),
    });
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_stream" });
    const { stream, thread: updated } = await mem.chatStream({
      threadId: thread.id,
      message: "test",
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " ", "world"]);

    // Verify the complete message was saved to storage
    const messages = await storage.getMessages(thread.id);
    expect(messages).toHaveLength(2); // user + assistant
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("test");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello world");
  });

  it("falls back to non-streaming when adapter lacks chatStream", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter();
    // Ensure chatStream is not present
    delete (llm as any).chatStream;
    const mem = await createVitamem({ llm, storage });

    const thread = await mem.createThread({ userId: "u_fallback" });
    const { stream } = await mem.chatStream({
      threadId: thread.id,
      message: "test",
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Should yield the full response as a single chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Reply to: test");

    // Verify message saved to storage
    const messages = await storage.getMessages(thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toContain("Reply to: test");
  });

  it("includes memories when autoRetrieve is enabled", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      chatStream: (_messages) => mockStreamGen(["response"]),
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage, autoRetrieve: true });

    // Seed a memory
    await storage.saveMemory({
      userId: "u_stream_mem",
      threadId: "t-1",
      content: "Has diabetes",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    const thread = await mem.createThread({ userId: "u_stream_mem" });
    const { stream, memories } = await mem.chatStream({
      threadId: thread.id,
      message: "health info",
    });

    // Consume the stream
    for await (const _ of stream) { /* drain */ }

    expect(memories).toBeDefined();
    expect(memories!.length).toBeGreaterThan(0);
    expect(memories![0].content).toBe("Has diabetes");
  });

  it("throws for non-existent thread", async () => {
    const storage = new EphemeralAdapter();
    const mem = await createVitamem({ llm: makeLLMAdapter(), storage });

    await expect(
      mem.chatStream({ threadId: "nonexistent", message: "Hi" }),
    ).rejects.toThrow("Thread not found");
  });
});

// ── chatWithUserStream ──

describe("createVitamem.chatWithUserStream", () => {
  it("resolves thread and streams", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      chatStream: (_messages) => mockStreamGen(["Hi", " there"]),
    });
    const mem = await createVitamem({ llm, storage });

    const { stream, thread } = await mem.chatWithUserStream({
      userId: "u_cws",
      message: "test",
    });

    expect(thread.userId).toBe("u_cws");
    expect(thread.state).toBe("active");

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hi", " there"]);

    // Verify message was saved
    const messages = await storage.getMessages(thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("Hi there");
  });
});

// ── Tier 3: MMR diversity (integration) ──

describe("createVitamem.memoryContextFormatter", () => {
  it("uses custom memoryContextFormatter when provided", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });

    const customFormatter = vi.fn().mockImplementation(
      (memories: MemoryMatch[], query: string) =>
        `CUSTOM: ${memories.map((m) => m.content).join(", ")} | Q: ${query}`,
    );

    const mem = await createVitamem({
      llm,
      storage,
      autoRetrieve: true,
      memoryContextFormatter: customFormatter,
    });

    // Seed a memory
    await storage.saveMemory({
      userId: "u_fmt",
      threadId: "t-1",
      content: "Takes metformin",
      source: "confirmed",
      embedding: [1, 0, 0],
    });

    const thread = await mem.createThread({ userId: "u_fmt" });
    await mem.chat({ threadId: thread.id, message: "My medications?" });

    // Verify custom formatter was called
    expect(customFormatter).toHaveBeenCalled();

    // Verify the formatted string was injected into chat messages
    const chatCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemMsg = chatCall.find(
      (m: { role: string; content: string }) =>
        m.role === "system" && m.content.startsWith("CUSTOM:"),
    );
    expect(systemMsg).toBeTruthy();
    expect(systemMsg.content).toContain("Takes metformin");
    expect(systemMsg.content).toContain("Q: My medications?");
  });
});

// ── Tier 3: MMR diversity (integration) ──

describe("createVitamem.diversityWeight", () => {
  it("promotes diverse results over similar ones", async () => {
    const storage = new EphemeralAdapter();
    const llm = makeLLMAdapter({
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
    });
    const mem = await createVitamem({ llm, storage, diversityWeight: 0.7 });

    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "A",
      source: "confirmed",
      embedding: [1, 0, 0],
    });
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "A-clone",
      source: "confirmed",
      embedding: [0.99, 0.1, 0],
    });
    await storage.saveMemory({
      userId: "u_1",
      threadId: "t-1",
      content: "B-diverse",
      source: "confirmed",
      embedding: [0, 1, 0],
    });

    const results = await mem.retrieve({ userId: "u_1", query: "test", limit: 2 });
    expect(results).toHaveLength(2);
    // Should include A (top score) and B-diverse (diverse) rather than A + A-clone
    const contents = results.map((r) => r.content);
    expect(contents).toContain("A");
    expect(contents).toContain("B-diverse");
  });
});
