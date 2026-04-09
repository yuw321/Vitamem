import {
  StorageAdapter,
  Thread,
  ThreadState,
  Message,
  Memory,
  MemoryMatch,
} from "../types.js";
import { cosineSimilarity } from "../memory/deduplication.js";

export interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  rpc(
    fn: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown[] | null; error: unknown }>;
}

export interface SupabaseQueryBuilder {
  insert(data: Record<string, unknown>): SupabaseQueryBuilder;
  select(columns?: string): SupabaseQueryBuilder;
  update(data: Record<string, unknown>): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(n: number): SupabaseQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  then(resolve: (result: { data: unknown[]; error: unknown }) => void): void;
}

/**
 * Supabase storage adapter for vitamem.
 */
export class SupabaseAdapter implements StorageAdapter {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createThread(userId: string): Promise<Thread> {
    const now = new Date();
    const id = crypto.randomUUID();
    const thread: Thread = {
      id,
      userId,
      state: "active",
      messages: [],
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      coolingStartedAt: null,
      dormantAt: null,
      closedAt: null,
    };

    const result = await this.client
      .from("threads")
      .insert({
        id: thread.id,
        user_id: thread.userId,
        state: thread.state,
        created_at: thread.createdAt.toISOString(),
        updated_at: thread.updatedAt.toISOString(),
      })
      .select()
      .single();

    if (result.error)
      throw new Error(`Failed to create thread: ${result.error}`);
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const result = await this.client
      .from("threads")
      .select()
      .eq("id", threadId)
      .single();

    if (result.error || !result.data) return null;
    return this.mapThread(result.data);
  }

  async getThreadsByState(state: ThreadState): Promise<Thread[]> {
    return new Promise((resolve, reject) => {
      this.client
        .from("threads")
        .select()
        .eq("state", state)
        .then((result) => {
          if (result.error)
            return reject(
              new Error(`Failed to get threads by state: ${result.error}`),
            );
          resolve(
            (result.data as Record<string, unknown>[]).map((row) =>
              this.mapThread(row),
            ),
          );
        });
    });
  }

  async updateThread(thread: Thread): Promise<Thread> {
    const result = await this.client
      .from("threads")
      .update({
        state: thread.state,
        updated_at: thread.updatedAt.toISOString(),
        last_message_at: thread.lastMessageAt?.toISOString() ?? null,
        cooling_started_at: thread.coolingStartedAt?.toISOString() ?? null,
        dormant_at: thread.dormantAt?.toISOString() ?? null,
        closed_at: thread.closedAt?.toISOString() ?? null,
      })
      .eq("id", thread.id)
      .select()
      .single();

    if (result.error)
      throw new Error(`Failed to update thread: ${result.error}`);
    return thread;
  }

  async addMessage(
    threadId: string,
    role: Message["role"],
    content: string,
  ): Promise<Message> {
    const now = new Date();
    const id = crypto.randomUUID();
    const message: Message = { id, threadId, role, content, createdAt: now };

    const result = await this.client
      .from("messages")
      .insert({
        id: message.id,
        thread_id: message.threadId,
        role: message.role,
        content: message.content,
        created_at: message.createdAt.toISOString(),
      })
      .select()
      .single();

    if (result.error) throw new Error(`Failed to add message: ${result.error}`);
    return message;
  }

  async getMessages(threadId: string): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      this.client
        .from("messages")
        .select()
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .then((result) => {
          if (result.error)
            return reject(new Error(`Failed to get messages: ${result.error}`));
          resolve(
            (result.data as Record<string, unknown>[]).map(this.mapMessage),
          );
        });
    });
  }

  async saveMemory(memory: Omit<Memory, "id" | "createdAt">): Promise<Memory> {
    const now = new Date();
    const id = crypto.randomUUID();
    const full: Memory = { ...memory, id, createdAt: now };

    const result = await this.client
      .from("memories")
      .insert({
        id: full.id,
        user_id: full.userId,
        thread_id: full.threadId,
        content: full.content,
        source: full.source,
        embedding: full.embedding,
        created_at: full.createdAt.toISOString(),
      })
      .select()
      .single();

    if (result.error) throw new Error(`Failed to save memory: ${result.error}`);
    return full;
  }

  async getMemories(userId: string): Promise<Memory[]> {
    return new Promise((resolve, reject) => {
      this.client
        .from("memories")
        .select()
        .eq("user_id", userId)
        .then((result) => {
          if (result.error)
            return reject(new Error(`Failed to get memories: ${result.error}`));
          resolve(
            (result.data as Record<string, unknown>[]).map(this.mapMemory),
          );
        });
    });
  }

  async searchMemories(
    userId: string,
    embedding: number[],
    limit = 10,
  ): Promise<MemoryMatch[]> {
    // Use pgvector server-side search via Supabase RPC
    // Requires the `match_memories` SQL function (see docs for migration)
    const result = await this.client.rpc("match_memories", {
      query_embedding: embedding,
      match_user_id: userId,
      match_limit: limit,
    });

    if (result.error) {
      // Fall back to client-side search if RPC is not available
      const memories = await this.getMemories(userId);
      return memories
        .filter((m) => m.embedding !== null)
        .map((m) => ({
          content: m.content,
          source: m.source,
          score: cosineSimilarity(embedding, m.embedding!),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    return (result.data as Record<string, unknown>[]).map((row) => ({
      content: row.content as string,
      source: row.source as MemoryMatch["source"],
      score: row.similarity as number,
    }));
  }

  async deleteMemory(memoryId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client
        .from("memories")
        .delete()
        .eq("id", memoryId)
        .then((result) => {
          if (result.error)
            return reject(
              new Error(`Failed to delete memory: ${result.error}`),
            );
          resolve();
        });
    });
  }

  async deleteUserMemories(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client
        .from("memories")
        .delete()
        .eq("user_id", userId)
        .then((result) => {
          if (result.error)
            return reject(
              new Error(`Failed to delete user memories: ${result.error}`),
            );
          resolve();
        });
    });
  }

  private mapThread(row: Record<string, unknown>): Thread {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      state: row.state as Thread["state"],
      messages: [],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      lastMessageAt: row.last_message_at
        ? new Date(row.last_message_at as string)
        : null,
      coolingStartedAt: row.cooling_started_at
        ? new Date(row.cooling_started_at as string)
        : null,
      dormantAt: row.dormant_at ? new Date(row.dormant_at as string) : null,
      closedAt: row.closed_at ? new Date(row.closed_at as string) : null,
    };
  }

  private mapMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      threadId: row.thread_id as string,
      role: row.role as Message["role"],
      content: row.content as string,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      threadId: row.thread_id as string,
      content: row.content as string,
      source: row.source as Memory["source"],
      embedding: row.embedding as number[] | null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
