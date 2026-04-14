import {
  StorageAdapter,
  Thread,
  ThreadState,
  Message,
  Memory,
  MemoryMatch,
  UserProfile,
  Medication,
  createEmptyProfile,
} from "../types.js";
import { cosineSimilarity } from "../memory/deduplication.js";
import { addGoalWithDedup } from "./goal-dedup.js";

/**
 * Ephemeral storage adapter — data lives in process memory.
 * For development and testing only. Data is lost when the process stops.
 */
export class EphemeralAdapter implements StorageAdapter {
  private threads = new Map<string, Thread>();
  private messages = new Map<string, Message[]>();
  private memories: Memory[] = [];
  private profiles = new Map<string, UserProfile>();

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
        lastRetrievedAt: m.lastRetrievedAt,
        retrievalCount: m.retrievalCount,
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

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId">>): Promise<void> {
    const profile = this.profiles.get(userId) ?? createEmptyProfile(userId);
    const merged = { ...profile, ...updates, userId, updatedAt: new Date() };
    // Don't overwrite arrays with empty arrays if not explicitly provided
    if (updates.conditions) merged.conditions = updates.conditions;
    if (updates.medications) merged.medications = updates.medications;
    if (updates.allergies) merged.allergies = updates.allergies;
    if (updates.goals) merged.goals = updates.goals;
    if (updates.emergencyContacts) merged.emergencyContacts = updates.emergencyContacts;
    if (updates.vitals) merged.vitals = { ...profile.vitals, ...updates.vitals };
    if (updates.customFields) merged.customFields = { ...profile.customFields, ...updates.customFields };
    this.profiles.set(userId, merged);
  }

  async updateProfileField(userId: string, field: string, value: unknown, action: "set" | "add" | "remove"): Promise<void> {
    const profile = this.profiles.get(userId) ?? createEmptyProfile(userId);
    const key = field as keyof UserProfile;

    if (action === "set") {
      // Vitals: unpack { key, record } into profile.vitals[key] with previousValue tracking
      if (field === "vitals" && typeof value === "object" && value !== null && 'key' in (value as Record<string, unknown>)) {
        const vitalEntry = value as { key: string; record: { value: number; unit: string } };
        const existing = profile.vitals[vitalEntry.key];
        // Same value — skip to preserve previousValue trail
        if (existing && existing.value === vitalEntry.record.value) {
          return;
        }
        profile.vitals[vitalEntry.key] = {
          ...vitalEntry.record,
          recordedAt: new Date(),
          ...(existing ? { previousValue: existing.value } : {}),
        };
      } else {
        (profile as unknown as Record<string, unknown>)[key] = value;
      }
    } else if (action === "add") {
      if (field === "vitals" && typeof value === "object" && value !== null) {
        const vitalEntry = value as { key: string; record: { value: number; unit: string } };
        const existing = profile.vitals[vitalEntry.key];
        profile.vitals[vitalEntry.key] = {
          ...vitalEntry.record,
          recordedAt: new Date(),
          ...(existing ? { previousValue: existing.value } : {}),
        } as UserProfile["vitals"][string];
      } else if (field === "medications" && typeof value === "object" && value !== null) {
        const med = value as Medication;
        const idx = profile.medications.findIndex((m) => m.name === med.name);
        if (idx >= 0) {
          profile.medications[idx] = med;
        } else {
          profile.medications.push(med);
        }
      } else if (field === "goals" && typeof value === "string") {
        addGoalWithDedup(profile.goals, value);
      } else if (Array.isArray((profile as unknown as Record<string, unknown>)[key])) {
        const arr = (profile as unknown as Record<string, unknown>)[key] as unknown[];
        if (typeof value === "string" && !arr.includes(value)) {
          arr.push(value);
        } else if (typeof value !== "string") {
          arr.push(value);
        }
      }
    } else if (action === "remove") {
      if (field === "medications" && typeof value === "string") {
        profile.medications = profile.medications.filter((m) => m.name !== value);
      } else if (Array.isArray((profile as unknown as Record<string, unknown>)[key])) {
        const arr = (profile as unknown as Record<string, unknown>)[key] as unknown[];
        (profile as unknown as Record<string, unknown>)[key] = arr.filter((item) => item !== value);
      }
    }

    profile.updatedAt = new Date();
    this.profiles.set(userId, profile);
  }
}
