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

export interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  rpc(
    fn: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown[] | null; error: unknown }>;
}

export interface SupabaseQueryBuilder {
  insert(data: Record<string, unknown>): SupabaseQueryBuilder;
  upsert(data: Record<string, unknown>, opts?: { onConflict?: string }): SupabaseQueryBuilder;
  select(columns?: string): SupabaseQueryBuilder;
  update(data: Record<string, unknown>): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(n: number): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  overlaps?(column: string, values: unknown[]): SupabaseQueryBuilder;
  is?(column: string, value: unknown): SupabaseQueryBuilder;
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
        pinned: full.pinned ?? false,
        tags: full.tags ?? [],
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
    filterTags?: string[],
  ): Promise<MemoryMatch[]> {
    // Use pgvector server-side search via Supabase RPC
    // Requires the `match_memories` SQL function (see docs for migration)
    const rpcParams: Record<string, unknown> = {
      query_embedding: embedding,
      match_user_id: userId,
      match_limit: limit,
    };
    if (filterTags && filterTags.length > 0) {
      rpcParams.filter_tags = filterTags;
    }

    const result = await this.client.rpc("match_memories", rpcParams);

    if (result.error) {
      // Fall back to client-side search if RPC is not available
      const memories = await this.getMemories(userId);
      let filtered = memories.filter((m) => m.embedding !== null);
      if (filterTags && filterTags.length > 0) {
        filtered = filtered.filter(
          (m) => m.tags && m.tags.some((t) => filterTags.includes(t)),
        );
      }
      return filtered
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

    return (result.data as Record<string, unknown>[]).map((row) => ({
      content: row.content as string,
      source: row.source as MemoryMatch["source"],
      score: row.similarity as number,
      id: row.id as string | undefined,
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      pinned: row.pinned as boolean | undefined,
      tags: row.tags as string[] | undefined,
      embedding: row.embedding as number[] | undefined,
      lastRetrievedAt: row.last_retrieved_at ? new Date(row.last_retrieved_at as string) : undefined,
      retrievalCount: row.retrieval_count as number | undefined,
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
      pinned: row.pinned as boolean | undefined,
      tags: row.tags as string[] | undefined,
      lastRetrievedAt: row.last_retrieved_at ? new Date(row.last_retrieved_at as string) : undefined,
      retrievalCount: row.retrieval_count as number | undefined,
    };
  }

  async getLatestActiveThread(userId: string): Promise<Thread | null> {
    const result = await this.client
      .from("threads")
      .select()
      .eq("user_id", userId)
      .in("state", ["active", "cooling"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (result.error || !result.data) return null;
    return this.mapThread(result.data);
  }

  async getPinnedMemories(userId: string): Promise<Memory[]> {
    return new Promise((resolve, reject) => {
      this.client
        .from("memories")
        .select()
        .eq("user_id", userId)
        .eq("pinned", true)
        .then((result) => {
          if (result.error)
            return reject(
              new Error(`Failed to get pinned memories: ${result.error}`),
            );
          resolve(
            (result.data as Record<string, unknown>[]).map(this.mapMemory),
          );
        });
    });
  }

  async updateMemory(memoryId: string, updates: Partial<Memory>): Promise<void> {
    const data: Record<string, unknown> = {};
    if (updates.pinned !== undefined) data.pinned = updates.pinned;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.content !== undefined) data.content = updates.content;
    if (updates.source !== undefined) data.source = updates.source;
    if (updates.embedding !== undefined) data.embedding = updates.embedding;
    if (updates.lastRetrievedAt !== undefined) data.last_retrieved_at = updates.lastRetrievedAt instanceof Date ? updates.lastRetrievedAt.toISOString() : updates.lastRetrievedAt;
    if (updates.retrievalCount !== undefined) data.retrieval_count = updates.retrievalCount;

    const result = await this.client
      .from("memories")
      .update(data)
      .eq("id", memoryId)
      .select()
      .single();

    if (result.error)
      throw new Error(`Failed to update memory: ${result.error}`);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.client
      .from("user_profiles")
      .select()
      .eq("user_id", userId)
      .single();

    if (result.error || !result.data) return null;
    return this.mapProfile(result.data);
  }

  async updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId">>): Promise<void> {
    const existing = await this.getProfile(userId);
    const base = existing ?? createEmptyProfile(userId);

    const merged: UserProfile = {
      ...base,
      ...updates,
      userId,
      vitals: updates.vitals ? { ...base.vitals, ...updates.vitals } : base.vitals,
      customFields: updates.customFields ? { ...base.customFields, ...updates.customFields } : base.customFields,
      updatedAt: new Date(),
    };

    const row: Record<string, unknown> = {
      user_id: userId,
      conditions: merged.conditions,
      medications: JSON.stringify(merged.medications),
      allergies: merged.allergies,
      vitals: JSON.stringify(merged.vitals),
      goals: merged.goals,
      emergency_contacts: merged.emergencyContacts,
      custom_fields: JSON.stringify(merged.customFields),
      updated_at: merged.updatedAt!.toISOString(),
    };

    const result = await this.client
      .from("user_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select()
      .single();

    if (result.error)
      throw new Error(`Failed to update profile: ${result.error}`);
  }

  async updateProfileField(userId: string, field: string, value: unknown, action: "set" | "add" | "remove"): Promise<void> {
    // Read-modify-write approach for consistent behavior
    const profile = (await this.getProfile(userId)) ?? createEmptyProfile(userId);
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

    // Write back the full profile
    const { userId: _uid, ...updates } = profile;
    await this.updateProfile(userId, updates);
  }

  private mapProfile(row: Record<string, unknown>): UserProfile {
    const parseJsonField = <T>(val: unknown, fallback: T): T => {
      if (val === null || val === undefined) return fallback;
      if (typeof val === "string") {
        try { return JSON.parse(val) as T; } catch { return fallback; }
      }
      return val as T;
    };

    return {
      userId: row.user_id as string,
      conditions: (row.conditions as string[]) ?? [],
      medications: parseJsonField<UserProfile["medications"]>(row.medications, []),
      allergies: (row.allergies as string[]) ?? [],
      vitals: parseJsonField<UserProfile["vitals"]>(row.vitals, {}),
      goals: (row.goals as string[]) ?? [],
      emergencyContacts: (row.emergency_contacts as string[]) ?? [],
      customFields: parseJsonField<Record<string, unknown>>(row.custom_fields, {}),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
  }
}
