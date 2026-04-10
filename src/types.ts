// ── Thread lifecycle states ──
export type ThreadState = "active" | "cooling" | "dormant" | "closed";

// ── Valid transitions map ──
export const VALID_TRANSITIONS: Record<ThreadState, ThreadState[]> = {
  active: ["cooling"],
  cooling: ["active", "dormant"],
  dormant: ["closed"],
  closed: [],
};

// ── Core domain types ──

export interface Thread {
  id: string;
  userId: string;
  state: ThreadState;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  coolingStartedAt: Date | null;
  dormantAt: Date | null;
  closedAt: Date | null;
}

export interface Message {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export type MemorySource = "confirmed" | "inferred";

export interface Memory {
  id: string;
  userId: string;
  threadId: string;
  content: string;
  source: MemorySource;
  embedding: number[] | null;
  createdAt: Date;
  pinned?: boolean;
  tags?: string[];
}

export interface MemoryMatch {
  content: string;
  source: MemorySource;
  score: number;
  id?: string;
  createdAt?: Date;
  pinned?: boolean;
  tags?: string[];
  embedding?: number[];
}

// ── Storage adapter interface ──

export interface StorageAdapter {
  createThread(userId: string): Promise<Thread>;
  getThread(threadId: string): Promise<Thread | null>;
  getThreadsByState?(state: ThreadState): Promise<Thread[]>;
  updateThread(thread: Thread): Promise<Thread>;
  addMessage(
    threadId: string,
    role: Message["role"],
    content: string,
  ): Promise<Message>;
  getMessages(threadId: string): Promise<Message[]>;
  saveMemory(memory: Omit<Memory, "id" | "createdAt">): Promise<Memory>;
  getMemories(userId: string): Promise<Memory[]>;
  searchMemories(
    userId: string,
    embedding: number[],
    limit?: number,
    filterTags?: string[],
  ): Promise<MemoryMatch[]>;
  deleteMemory?(memoryId: string): Promise<void>;
  deleteUserMemories?(userId: string): Promise<void>;
  getLatestActiveThread?(userId: string): Promise<Thread | null>;
  getPinnedMemories?(userId: string): Promise<Memory[]>;
  updateMemory?(memoryId: string, updates: Partial<Memory>): Promise<void>;
}

// ── LLM adapter interface ──

export interface LLMAdapter {
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  extractMemories(
    messages: Message[],
  ): Promise<Array<{ content: string; source: MemorySource }>>;
  embed(text: string): Promise<number[]>;
}

// ── Configuration ──

import type { PresetName } from "./presets.js";

export type ProviderName = "openai" | "anthropic" | "ollama";

export interface VitamemConfig {
  // LLM — string shortcut OR adapter instance (one required)
  provider?: ProviderName;
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  baseUrl?: string;
  llm?: LLMAdapter;

  // Storage — string shortcut OR adapter instance (one required)
  storage: "ephemeral" | "supabase" | StorageAdapter;
  supabaseUrl?: string;
  supabaseKey?: string;

  // Behavioral settings
  preset?: PresetName;
  coolingTimeoutMs?: number; // default: 6 hours
  dormantTimeoutMs?: number; // default: coolingTimeoutMs
  closedTimeoutMs?: number; // default: 30 days
  embeddingConcurrency?: number; // default: 5
  autoRetrieve?: boolean; // default: false

  // Retrieval controls
  onRetrieve?: (memories: MemoryMatch[], query: string) => MemoryMatch[] | Promise<MemoryMatch[]>;
  minScore?: number; // default: 0 (no filtering)
  recencyWeight?: number; // 0-1, default: 0 (pure cosine similarity)
  recencyMaxAgeMs?: number; // normalization window, default: 90 days
  diversityWeight?: number; // 0-1, default: 0 (standard top-K)
}

// ── Facade interface ──

export interface Vitamem {
  createThread(opts: { userId: string }): Promise<Thread>;
  chat(opts: {
    threadId: string;
    message: string;
    systemPrompt?: string;
  }): Promise<{
    reply: string;
    thread: Thread;
    memories?: MemoryMatch[];
    previousThreadId?: string;
    redirected?: boolean;
  }>;
  retrieve(opts: {
    userId: string;
    query: string;
    limit?: number;
    filterTags?: string[];
  }): Promise<MemoryMatch[]>;
  pinMemory(memoryId: string): Promise<void>;
  unpinMemory(memoryId: string): Promise<void>;
  getThread(threadId: string): Promise<Thread | null>;
  getOrCreateThread(userId: string): Promise<Thread>;
  chatWithUser(opts: {
    userId: string;
    message: string;
    systemPrompt?: string;
  }): Promise<{
    reply: string;
    thread: Thread;
    memories?: MemoryMatch[];
    previousThreadId?: string;
    redirected?: boolean;
  }>;
  triggerDormantTransition(threadId: string): Promise<void>;
  closeThread(threadId: string): Promise<void>;
  sweepThreads(): Promise<void>;
  deleteMemory(memoryId: string): Promise<void>;
  deleteUserData(userId: string): Promise<void>;
}
