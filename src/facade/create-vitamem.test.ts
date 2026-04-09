import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVitamem } from "./create-vitamem.js";
import { Thread, Message, LLMAdapter, StorageAdapter } from "../types.js";
import { EphemeralAdapter } from "../storage/ephemeral-adapter.js";

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
