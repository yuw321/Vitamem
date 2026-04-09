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
}

export interface MemoryMatch {
  content: string;
  source: MemorySource;
  score: number;
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
  ): Promise<MemoryMatch[]>;
  deleteMemory?(memoryId: string): Promise<void>;
  deleteUserMemories?(userId: string): Promise<void>;
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
  coolingTimeoutMs?: number; // default: 6 hours
  closedTimeoutMs?: number; // default: 30 days
  embeddingConcurrency?: number; // default: 5
  autoRetrieve?: boolean; // default: false
}

// ── Facade interface ──

export interface Vitamem {
  createThread(opts: { userId: string }): Promise<Thread>;
  chat(opts: {
    threadId: string;
    message: string;
    systemPrompt?: string;
  }): Promise<{ reply: string; thread: Thread; memories?: MemoryMatch[] }>;
  retrieve(opts: {
    userId: string;
    query: string;
    limit?: number;
  }): Promise<MemoryMatch[]>;
  getThread(threadId: string): Promise<Thread | null>;
  triggerDormantTransition(threadId: string): Promise<void>;
  closeThread(threadId: string): Promise<void>;
  sweepThreads(): Promise<void>;
  deleteMemory(memoryId: string): Promise<void>;
  deleteUserData(userId: string): Promise<void>;
}
