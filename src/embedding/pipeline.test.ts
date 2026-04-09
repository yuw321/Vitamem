import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEmbeddingPipeline, EmbeddingPipelineResult } from './pipeline.js';
import { Thread, Message, Memory, LLMAdapter, StorageAdapter } from '../types.js';

// ── Helpers ──

function makeThread(overrides: Partial<Thread> = {}): Thread {
  const now = new Date();
  return {
    id: 'thread-1',
    userId: 'user-1',
    state: 'dormant',
    messages: [],
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    coolingStartedAt: null,
    dormantAt: now,
    closedAt: null,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: crypto.randomUUID(),
    threadId: 'thread-1',
    role: 'user',
    content: 'test message',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLLMAdapter(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  let embedCallCount = 0;
  return {
    chat: vi.fn().mockResolvedValue('reply'),
    extractMemories: vi.fn().mockResolvedValue([]),
    embed: vi.fn().mockImplementation(async (text: string) => {
      // Return different embeddings for different texts
      embedCallCount++;
      return Array.from({ length: 3 }, (_, i) => Math.sin(embedCallCount + i));
    }),
    ...overrides,
  };
}

function makeStorageAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    createThread: vi.fn(),
    getThread: vi.fn(),
    updateThread: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    saveMemory: vi.fn().mockImplementation(async (m) => ({
      ...m,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    })),
    getMemories: vi.fn().mockResolvedValue([]),
    searchMemories: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Tests ──

describe('runEmbeddingPipeline', () => {
  it('returns zero counts for empty messages', async () => {
    const thread = makeThread();
    const llm = makeLLMAdapter();
    const storage = makeStorageAdapter();

    const result = await runEmbeddingPipeline(thread, [], llm, storage);

    expect(result).toEqual({
      memoriesSaved: 0,
      memoriesDeduped: 0,
      totalExtracted: 0,
    });
    expect(llm.extractMemories).not.toHaveBeenCalled();
  });

  it('returns zero counts when LLM extracts no facts', async () => {
    const messages = [makeMessage()];
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([]),
    });
    const storage = makeStorageAdapter();

    const result = await runEmbeddingPipeline(makeThread(), messages, llm, storage);

    expect(result.totalExtracted).toBe(0);
    expect(result.memoriesSaved).toBe(0);
  });

  it('extracts, embeds, and saves new memories', async () => {
    const messages = [
      makeMessage({ role: 'user', content: 'I prefer TypeScript.' }),
      makeMessage({ role: 'assistant', content: 'Noted!' }),
    ];

    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Prefers TypeScript', source: 'confirmed' },
        { content: 'Works in software', source: 'inferred' },
      ]),
    });

    const storage = makeStorageAdapter();

    const result = await runEmbeddingPipeline(makeThread(), messages, llm, storage);

    expect(result.totalExtracted).toBe(2);
    expect(result.memoriesSaved).toBe(2);
    expect(result.memoriesDeduped).toBe(0);
    expect(llm.embed).toHaveBeenCalledTimes(2);
    expect(storage.saveMemory).toHaveBeenCalledTimes(2);
  });

  it('deduplicates against existing memories', async () => {
    const messages = [makeMessage()];

    const existingEmbedding = [0.5, 0.5, 0.5];
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Prefers TypeScript', source: 'confirmed' },
      ]),
      // Return embedding that matches existing
      embed: vi.fn().mockResolvedValue(existingEmbedding),
    });

    const storage = makeStorageAdapter({
      getMemories: vi.fn().mockResolvedValue([
        {
          id: 'mem-1',
          userId: 'user-1',
          threadId: 'old-thread',
          content: 'Likes TypeScript',
          source: 'confirmed',
          embedding: existingEmbedding,
          createdAt: new Date(),
        },
      ]),
    });

    const result = await runEmbeddingPipeline(makeThread(), messages, llm, storage);

    expect(result.totalExtracted).toBe(1);
    expect(result.memoriesDeduped).toBe(1);
    expect(result.memoriesSaved).toBe(0);
    expect(storage.saveMemory).not.toHaveBeenCalled();
  });

  it('saves only unique facts when some are duplicates', async () => {
    const messages = [makeMessage()];

    const existingEmbedding = [1, 0, 0];
    let callCount = 0;
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Prefers TypeScript', source: 'confirmed' },  // will match existing
        { content: 'Works in fintech', source: 'confirmed' },     // unique
      ]),
      embed: vi.fn().mockImplementation(async () => {
        callCount++;
        // First call: matches existing, second call: different
        return callCount === 1 ? [1, 0, 0] : [0, 1, 0];
      }),
    });

    const storage = makeStorageAdapter({
      getMemories: vi.fn().mockResolvedValue([
        { embedding: existingEmbedding },
      ]),
    });

    const result = await runEmbeddingPipeline(makeThread(), messages, llm, storage);

    expect(result.totalExtracted).toBe(2);
    expect(result.memoriesSaved).toBe(1);
    expect(result.memoriesDeduped).toBe(1);
  });

  it('uses the thread userId for memory storage', async () => {
    const thread = makeThread({ userId: 'special-user' });
    const messages = [makeMessage()];

    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'A fact', source: 'confirmed' },
      ]),
    });

    const storage = makeStorageAdapter();

    await runEmbeddingPipeline(thread, messages, llm, storage);

    expect(storage.getMemories).toHaveBeenCalledWith('special-user');
    expect(storage.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'special-user' }),
    );
  });

  it('uses the thread id for memory threadId', async () => {
    const thread = makeThread({ id: 'my-thread-42' });
    const messages = [makeMessage()];

    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'A fact', source: 'confirmed' },
      ]),
    });

    const storage = makeStorageAdapter();

    await runEmbeddingPipeline(thread, messages, llm, storage);

    expect(storage.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'my-thread-42' }),
    );
  });

  it('passes configurable deduplication threshold', async () => {
    const messages = [makeMessage()];

    // Embeddings that are similar but not identical
    const existingEmbedding = [1, 0, 0];
    const newEmbedding = [0.95, 0.3, 0]; // cosine sim ≈ 0.95

    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Similar fact', source: 'confirmed' },
      ]),
      embed: vi.fn().mockResolvedValue(newEmbedding),
    });

    const storage = makeStorageAdapter({
      getMemories: vi.fn().mockResolvedValue([{ embedding: existingEmbedding }]),
    });

    // With strict threshold (0.99), should NOT be deduped
    const result = await runEmbeddingPipeline(makeThread(), messages, llm, storage, 0.99);
    expect(result.memoriesSaved).toBe(1);
  });

  it('embeds each extracted fact individually', async () => {
    const messages = [makeMessage()];

    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Fact one', source: 'confirmed' },
        { content: 'Fact two', source: 'inferred' },
        { content: 'Fact three', source: 'confirmed' },
      ]),
    });

    const storage = makeStorageAdapter();

    await runEmbeddingPipeline(makeThread(), messages, llm, storage);

    expect(llm.embed).toHaveBeenCalledTimes(3);
    expect(llm.embed).toHaveBeenCalledWith('Fact one');
    expect(llm.embed).toHaveBeenCalledWith('Fact two');
    expect(llm.embed).toHaveBeenCalledWith('Fact three');
  });
});
