import {
  StorageAdapter,
  Thread,
  ThreadState,
  Message,
  Memory,
  MemoryMatch,
} from "../types.js";
import { cosineSimilarity } from "../memory/deduplication.js";

/**
 * Ephemeral storage adapter — data lives in process memory.
 * For development and testing only. Data is lost when the process stops.
 */
export class EphemeralAdapter implements StorageAdapter {
  private threads = new Map<string, Thread>();
  private messages = new Map<string, Message[]>();
  private memories: Memory[] = [];

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
    this.threads.set(id, thread);
    this.messages.set(id, []);
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async getThreadsByState(state: ThreadState): Promise<Thread[]> {
    const result: Thread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.state === state) {
        result.push(thread);
      }
    }
    return result;
  }

  async updateThread(thread: Thread): Promise<Thread> {
    this.threads.set(thread.id, { ...thread });
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
    const threadMessages = this.messages.get(threadId) ?? [];
    threadMessages.push(message);
    this.messages.set(threadId, threadMessages);
    return message;
  }

  async getMessages(threadId: string): Promise<Message[]> {
    return this.messages.get(threadId) ?? [];
  }

  async saveMemory(memory: Omit<Memory, "id" | "createdAt">): Promise<Memory> {
    const now = new Date();
    const id = crypto.randomUUID();
    const full: Memory = { ...memory, id, createdAt: now };
    this.memories.push(full);
    return full;
  }

  async getMemories(userId: string): Promise<Memory[]> {
    return this.memories.filter((m) => m.userId === userId);
  }

  async searchMemories(
    userId: string,
    embedding: number[],
    limit = 10,
    filterTags?: string[],
  ): Promise<MemoryMatch[]> {
    let userMemories = this.memories.filter(
      (m) => m.userId === userId && m.embedding !== null,
    );

    // Pre-filter by tags if provided
    if (filterTags && filterTags.length > 0) {
      userMemories = userMemories.filter(
        (m) => m.tags && m.tags.some((t) => filterTags.includes(t)),
      );
    }

    return userMemories
      .map((m) => ({
        content: m.content,
        source: m.source,
        score: cosineSimilarity(embedding, m.embedding!),
        id: m.id,
        createdAt: m.createdAt,
        pinned: m.pinned,
        tags: m.tags,
        embedding: m.embedding ?? undefined,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.memories = this.memories.filter((m) => m.id !== memoryId);
  }

  async deleteUserMemories(userId: string): Promise<void> {
    this.memories = this.memories.filter((m) => m.userId !== userId);
  }

  async getLatestActiveThread(userId: string): Promise<Thread | null> {
    const candidates = [...this.threads.values()]
      .filter(t => t.userId === userId && (t.state === 'active' || t.state === 'cooling'))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return candidates[0] ?? null;
  }

  async getPinnedMemories(userId: string): Promise<Memory[]> {
    return this.memories.filter(
      (m) => m.userId === userId && m.pinned === true,
    );
  }

  async updateMemory(memoryId: string, updates: Partial<Memory>): Promise<void> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx === -1) throw new Error(`Memory not found: ${memoryId}`);
    this.memories[idx] = { ...this.memories[idx], ...updates };
  }
}
