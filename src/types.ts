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
  chatStream?(
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<string, void, unknown>;
  extractMemories(
    messages: Message[],
  ): Promise<Array<{ content: string; source: MemorySource }>>;
  embed(text: string): Promise<number[]>;
}

/**
 * Rule for automatically pinning critical memories during extraction.
 * Can be a regex pattern match or a custom test function.
 */
export type AutoPinRule =
  | { pattern: RegExp; reason?: string }
  | { test: (memory: { content: string; source: MemorySource; tags?: string[] }) => boolean; reason?: string };

/**
 * Classification result for a new fact against existing memories.
 * - "skip": Exact duplicate (>= deduplicationThreshold), discard
 * - "supersede": Same topic with updated value (>= supersedeThreshold, < deduplicationThreshold), update existing
 * - "save": New distinct fact (< supersedeThreshold), save as new memory
 */
export type FactClassification =
  | { action: "skip" }
  | { action: "supersede"; existingIndex: number; similarity: number }
  | { action: "save" };

/**
 * Built-in auto-pin rules for health companion use cases.
 * Automatically pins memories containing critical safety information.
 */
export const HEALTH_AUTO_PIN_RULES: AutoPinRule[] = [
  { pattern: /\ballerg(y|ic|ies)\b/i, reason: "allergy" },
  { pattern: /\banaphyla(xis|ctic)\b/i, reason: "anaphylaxis-risk" },
  { pattern: /\b(drug|medication)\s*(interaction|contraindication)\b/i, reason: "drug-interaction" },
  { pattern: /\bdo\s*not\s*(take|use|prescribe)\b/i, reason: "contraindication" },
  { pattern: /\bemergency\s*contact\b/i, reason: "emergency-contact" },
  { pattern: /\bblood\s*type\b/i, reason: "blood-type" },
];

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

  // OpenAI-specific API mode and pass-through options
  apiMode?: 'completions' | 'responses';
  extraChatOptions?: Record<string, unknown>;
  extraEmbeddingOptions?: Record<string, unknown>;

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

  // === Memory Extraction ===
  /** Top-level extraction prompt override. Forwarded to the adapter when using `provider` shortcut. */
  extractionPrompt?: string;

  // === Memory Context Formatting ===
  /** Custom formatter for auto-retrieve memory injection. Replaces the default bullet-point format. */
  memoryContextFormatter?: (memories: MemoryMatch[], query: string) => string;

  // === Deduplication & Supersede ===
  /** Cosine similarity threshold for exact duplicate detection. Default: 0.92 */
  deduplicationThreshold?: number;
  /** Cosine similarity threshold for superseding (updating) existing memories. Default: 0.75.
   * Facts with similarity >= supersedeThreshold and < deduplicationThreshold update the existing memory. */
  supersedeThreshold?: number;

  // === Auto-Pinning ===
  /** Rules that automatically pin critical memories during extraction. Use HEALTH_AUTO_PIN_RULES for health domains. */
  autoPinRules?: AutoPinRule[];
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
  chatStream(opts: {
    threadId: string;
    message: string;
    systemPrompt?: string;
  }): Promise<{
    stream: AsyncGenerator<string, void, unknown>;
    thread: Thread;
    memories?: MemoryMatch[];
    previousThreadId?: string;
    redirected?: boolean;
  }>;
  chatWithUserStream(opts: {
    userId: string;
    message: string;
    systemPrompt?: string;
  }): Promise<{
    stream: AsyncGenerator<string, void, unknown>;
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
