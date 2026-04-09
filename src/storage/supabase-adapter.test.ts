import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAdapter, SupabaseClient, SupabaseQueryBuilder } from './supabase-adapter.js';
import { Thread } from '../types.js';

// ── Mock Supabase client ──

function createMockQueryBuilder(data: unknown = null, error: unknown = null): SupabaseQueryBuilder {
  const builder: SupabaseQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: vi.fn().mockImplementation((resolve) => {
      resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error });
    }),
  };
  return builder;
}

function createMockClient(queryBuilder: SupabaseQueryBuilder, rpcData: unknown = null, rpcError: unknown = null): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue(queryBuilder),
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
  };
}

// ── createThread ──

describe('SupabaseAdapter.createThread', () => {
  it('creates a thread with active state', async () => {
    const builder = createMockQueryBuilder({ id: 'test-id' });
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const thread = await adapter.createThread('user-1');

    expect(thread.userId).toBe('user-1');
    expect(thread.state).toBe('active');
    expect(thread.messages).toEqual([]);
    expect(thread.lastMessageAt).toBeNull();
    expect(thread.coolingStartedAt).toBeNull();
    expect(thread.dormantAt).toBeNull();
    expect(thread.closedAt).toBeNull();
    expect(client.from).toHaveBeenCalledWith('threads');
    expect(builder.insert).toHaveBeenCalled();
  });

  it('throws when insert fails', async () => {
    const builder = createMockQueryBuilder(null, 'insert failed');
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    await expect(adapter.createThread('user-1')).rejects.toThrow('Failed to create thread');
  });
});

// ── getThread ──

describe('SupabaseAdapter.getThread', () => {
  it('returns null when thread not found', async () => {
    const builder = createMockQueryBuilder(null, 'not found');
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const thread = await adapter.getThread('nonexistent');
    expect(thread).toBeNull();
  });

  it('maps database row to Thread object', async () => {
    const now = new Date().toISOString();
    const builder = createMockQueryBuilder({
      id: 'thread-1',
      user_id: 'user-1',
      state: 'active',
      created_at: now,
      updated_at: now,
      last_message_at: null,
      cooling_started_at: null,
      dormant_at: null,
      closed_at: null,
    });
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const thread = await adapter.getThread('thread-1');

    expect(thread).not.toBeNull();
    expect(thread!.id).toBe('thread-1');
    expect(thread!.userId).toBe('user-1');
    expect(thread!.state).toBe('active');
    expect(thread!.createdAt).toBeInstanceOf(Date);
  });

  it('queries the threads table with correct id', async () => {
    const builder = createMockQueryBuilder(null, 'not found');
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    await adapter.getThread('thread-42');

    expect(client.from).toHaveBeenCalledWith('threads');
    expect(builder.eq).toHaveBeenCalledWith('id', 'thread-42');
  });
});

// ── updateThread ──

describe('SupabaseAdapter.updateThread', () => {
  it('updates thread state in database', async () => {
    const builder = createMockQueryBuilder({});
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const thread: Thread = {
      id: 'thread-1',
      userId: 'user-1',
      state: 'cooling',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
      coolingStartedAt: new Date(),
      dormantAt: null,
      closedAt: null,
    };

    await adapter.updateThread(thread);

    expect(client.from).toHaveBeenCalledWith('threads');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'cooling' }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'thread-1');
  });

  it('throws when update fails', async () => {
    const builder = createMockQueryBuilder(null, 'update failed');
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const thread: Thread = {
      id: 'thread-1',
      userId: 'user-1',
      state: 'active',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
      coolingStartedAt: null,
      dormantAt: null,
      closedAt: null,
    };

    await expect(adapter.updateThread(thread)).rejects.toThrow('Failed to update thread');
  });
});

// ── addMessage ──

describe('SupabaseAdapter.addMessage', () => {
  it('inserts a message into the messages table', async () => {
    const builder = createMockQueryBuilder({});
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const message = await adapter.addMessage('thread-1', 'user', 'Hello!');

    expect(message.threadId).toBe('thread-1');
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello!');
    expect(message.createdAt).toBeInstanceOf(Date);
    expect(client.from).toHaveBeenCalledWith('messages');
  });

  it('throws when insert fails', async () => {
    const builder = createMockQueryBuilder(null, 'insert failed');
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    await expect(adapter.addMessage('t', 'user', 'msg')).rejects.toThrow('Failed to add message');
  });
});

// ── saveMemory ──

describe('SupabaseAdapter.saveMemory', () => {
  it('inserts a memory with embedding', async () => {
    const builder = createMockQueryBuilder({});
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    const memory = await adapter.saveMemory({
      userId: 'user-1',
      threadId: 'thread-1',
      content: 'Prefers TypeScript',
      source: 'confirmed',
      embedding: [0.1, 0.2, 0.3],
    });

    expect(memory.content).toBe('Prefers TypeScript');
    expect(memory.source).toBe('confirmed');
    expect(memory.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(memory.createdAt).toBeInstanceOf(Date);
    expect(client.from).toHaveBeenCalledWith('memories');
  });
});

// ── searchMemories ──

describe('SupabaseAdapter.searchMemories', () => {
  it('uses pgvector RPC when available', async () => {
    const rpcData = [
      { content: 'Prefers TypeScript', source: 'confirmed', similarity: 0.95 },
      { content: 'Works in fintech', source: 'confirmed', similarity: 0.42 },
    ];

    const builder = createMockQueryBuilder();
    const client = createMockClient(builder, rpcData);
    const adapter = new SupabaseAdapter(client);

    const results = await adapter.searchMemories('user-1', [1, 0, 0], 10);

    expect(client.rpc).toHaveBeenCalledWith('match_memories', {
      query_embedding: [1, 0, 0],
      match_user_id: 'user-1',
      match_limit: 10,
    });
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Prefers TypeScript');
    expect(results[0].score).toBe(0.95);
  });

  it('falls back to client-side search when RPC fails', async () => {
    const memories = [
      {
        id: 'mem-1',
        user_id: 'user-1',
        thread_id: 't-1',
        content: 'Prefers TypeScript',
        source: 'confirmed',
        embedding: [1, 0, 0],
        created_at: new Date().toISOString(),
      },
      {
        id: 'mem-2',
        user_id: 'user-1',
        thread_id: 't-1',
        content: 'Works in fintech',
        source: 'confirmed',
        embedding: [0, 1, 0],
        created_at: new Date().toISOString(),
      },
    ];

    const builder = createMockQueryBuilder(memories);
    // RPC fails (e.g. function not created yet)
    const client = createMockClient(builder, null, 'function not found');
    const adapter = new SupabaseAdapter(client);

    const results = await adapter.searchMemories('user-1', [1, 0, 0], 10);

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Prefers TypeScript');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('respects the limit parameter', async () => {
    const rpcData = Array.from({ length: 5 }, (_, i) => ({
      content: `Fact ${i}`,
      source: 'confirmed',
      similarity: 1 - i * 0.1,
    }));

    const builder = createMockQueryBuilder();
    const client = createMockClient(builder, rpcData.slice(0, 2));
    const adapter = new SupabaseAdapter(client);

    const results = await adapter.searchMemories('user-1', [1, 0, 0], 2);
    expect(results).toHaveLength(2);
  });
});

// ── deleteMemory ──

describe('SupabaseAdapter.deleteMemory', () => {
  it('deletes a memory by id', async () => {
    const builder = createMockQueryBuilder([]);
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    await adapter.deleteMemory('mem-1');

    expect(client.from).toHaveBeenCalledWith('memories');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'mem-1');
  });

  it('deletes all memories for a user', async () => {
    const builder = createMockQueryBuilder([]);
    const client = createMockClient(builder);
    const adapter = new SupabaseAdapter(client);

    await adapter.deleteUserMemories('user-1');

    expect(client.from).toHaveBeenCalledWith('memories');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
