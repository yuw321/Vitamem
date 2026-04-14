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
  /** When this memory was last retrieved */
  lastRetrievedAt?: Date;
  /** How many times this memory has been retrieved */
  retrievalCount?: number;
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
  /** When this memory was last retrieved */
  lastRetrievedAt?: Date;
  /** How many times this memory has been retrieved */
  retrievalCount?: number;
}

// ── Forgetting / decay configuration ──

export interface ForgettingConfig {
  /** Half-life for memory decay in milliseconds. Default: 180 days (15552000000ms) */
  forgettingHalfLifeMs?: number;
  /** Score threshold below which memories are archived. Default: 0.1 */
  minRetrievalScore?: number;
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

  /** Get the user's structured profile. Returns null if no profile exists. */
  getProfile?(userId: string): Promise<UserProfile | null>;

  /** Update the user's profile with partial data (merge semantics). Creates profile if it doesn't exist. */
  updateProfile?(userId: string, updates: Partial<Omit<UserProfile, "userId">>): Promise<void>;

  /** Update a single profile field with set/add/remove semantics for array fields. */
  updateProfileField?(userId: string, field: string, value: unknown, action: "set" | "add" | "remove"): Promise<void>;
}

// ── LLM adapter interface ──

export interface LLMAdapter {
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  chatStream?(
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<string, void, unknown>;
  extractMemories(
    messages: Message[],
    sessionDate?: string,
  ): Promise<Array<{
    content: string;
    source: MemorySource;
    tags?: string[];
    profileField?: 'conditions' | 'medications' | 'allergies' | 'vitals' | 'goals' | 'none';
    profileKey?: string;
    profileValue?: string | number | { name: string; dosage?: string; frequency?: string };
    profileUnit?: string;
  }>>;
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
  { pattern: /\b\d+\s*(mg|mcg|ml|units?)\b/i, reason: "medication-dosage" },
];

// ── Hybrid memory: structured profile types ──

export interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  /** When the medication was started or last confirmed */
  updatedAt?: Date;
}

export interface VitalRecord {
  value: number;
  unit: string;
  /** When this reading was recorded */
  recordedAt?: Date;
  /** Previous value before this update, for tracking trends */
  previousValue?: number;
}

export interface UserProfile {
  userId: string;
  /** Active medical conditions */
  conditions: string[];
  /** Current medications with dosage information */
  medications: Medication[];
  /** Known allergies */
  allergies: string[];
  /** Health vitals keyed by metric name (e.g., "a1c", "blood_pressure", "weight") */
  vitals: Record<string, VitalRecord>;
  /** Health and wellness goals */
  goals: string[];
  /** Emergency contacts */
  emergencyContacts: string[];
  /** Extensible key-value store for domain-specific fields */
  customFields: Record<string, unknown>;
  /** Last time profile was updated */
  updatedAt?: Date;
}

export interface StructuredFact {
  /** Which profile field this fact maps to */
  field: keyof Omit<UserProfile, "userId" | "customFields" | "updatedAt">;
  /** The extracted value (type depends on field) */
  value: unknown;
  /** Whether to set, add to array, or remove from array */
  action: "set" | "add" | "remove";
  /** Original extracted text that produced this fact */
  sourceText: string;
}

export interface StructuredExtractionRule {
  /** Regex pattern to match against extracted fact text */
  pattern: RegExp;
  /** Which profile field this rule targets */
  profileField: keyof Omit<UserProfile, "userId" | "customFields" | "updatedAt">;
  /** Function to extract the structured value from the matched text */
  extractor: (text: string, match: RegExpMatchArray) => { value: unknown; action: "set" | "add" | "remove" };
}

export const HEALTH_STRUCTURED_RULES: StructuredExtractionRule[] = [
  // Vitals: A1C / HbA1c
  {
    pattern: /\bA1C\b.*?(\d+\.?\d*)%?/i,
    profileField: "vitals",
    extractor: (_text, match) => ({
      value: { key: "a1c", record: { value: parseFloat(match[1]), unit: "%" } },
      action: "set",
    }),
  },
  // Vitals: Blood pressure
  {
    pattern: /\bblood\s*pressure\b.*?(\d{2,3})\s*\/\s*(\d{2,3})/i,
    profileField: "vitals",
    extractor: (_text, match) => ({
      value: { key: "blood_pressure", record: { value: parseFloat(match[1]), unit: `${match[1]}/${match[2]} mmHg` } },
      action: "set",
    }),
  },
  // Vitals: Weight
  {
    pattern: /\bweigh[ts]?\b.*?(\d+\.?\d*)\s*(lbs?|kg|pounds?|kilograms?)/i,
    profileField: "vitals",
    extractor: (_text, match) => ({
      value: { key: "weight", record: { value: parseFloat(match[1]), unit: match[2].replace(/s$/, '') } },
      action: "set",
    }),
  },
  // Vitals: Blood glucose / blood sugar
  {
    pattern: /\b(?:blood\s*(?:sugar|glucose)|glucose)\b.*?(\d+\.?\d*)\s*(mg\/dl|mmol\/l)?/i,
    profileField: "vitals",
    extractor: (_text, match) => ({
      value: { key: "blood_glucose", record: { value: parseFloat(match[1]), unit: match[2] || "mg/dL" } },
      action: "set",
    }),
  },
  // Allergies
  {
    pattern: /\ballerg(?:y|ic|ies)\s+(?:to\s+)?(.+)/i,
    profileField: "allergies",
    extractor: (_text, match) => ({
      value: match[1].trim().replace(/[.,;].*$/, ''),
      action: "add",
    }),
  },
  // Medications (with dosage)
  {
    pattern: /\b(?:takes?|taking|prescribed|on)\s+(\w+)\s+(\d+\s*(?:mg|mcg|ml|units?)(?:\s+\w+)?)/i,
    profileField: "medications",
    extractor: (_text, match) => ({
      value: { name: match[1], dosage: match[2].trim() },
      action: "add",
    }),
  },
  // Conditions
  {
    pattern: /\b(?:diagnosed\s+with|has|manages?|managing|living\s+with)\s+(.+?)(?:\s+for\s+|\s*[.,;]|$)/i,
    profileField: "conditions",
    extractor: (_text, match) => ({
      value: match[1].trim(),
      action: "add",
    }),
  },
  // Goals
  {
    pattern: /\bgoal\b.*?(?:is|to)\s+(.+?)(?:\s*[.,;]|$)/i,
    profileField: "goals",
    extractor: (_text, match) => ({
      value: match[1].trim(),
      action: "add",
    }),
  },
];

export function createEmptyProfile(userId: string): UserProfile {
  return {
    userId,
    conditions: [],
    medications: [],
    allergies: [],
    vitals: {},
    goals: [],
    emergencyContacts: [],
    customFields: {},
  };
}

// ── Reflection types ──

export interface ReflectionResult {
  correctedFacts: Array<{
    content: string;
    source: 'confirmed' | 'inferred';
    action: 'keep' | 'enrich' | 'remove';
    reason?: string;
    tags?: string[];
    profileField?: string;
    profileKey?: string;
    profileValue?: string;
    profileUnit?: string;
  }>;
  missedFacts: Array<{
    content: string;
    source: 'confirmed' | 'inferred';
    tags?: string[];
    profileField?: string;
    profileKey?: string;
    profileValue?: string;
    profileUnit?: string;
  }>;
  conflicts: Array<{
    newFact: string;
    existingMemory: string;
    resolution: 'keep_new' | 'keep_existing' | 'merge';
  }>;
}

// ── Configuration ──

import type { PresetName } from "./presets.js";

export type ProviderName = "openai" | "anthropic" | "ollama";

export interface VitamemConfig {
  // LLM — string shortcut OR adapter instance (one required)
  provider?: ProviderName;
  apiKey?: string;
  model?: string;
  extractionModel?: string;
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

  // === Active Forgetting ===
  /** Configuration for relevance decay / active forgetting. If not set, decay is disabled. */
  forgetting?: ForgettingConfig;

    // === Auto-Pinning ===
  /** Rules that automatically pin critical memories during extraction. Use HEALTH_AUTO_PIN_RULES for health domains. */
  autoPinRules?: AutoPinRule[];

  // === Structured Extraction ===
  /** Rules for extracting structured facts into the user profile. Use HEALTH_STRUCTURED_RULES for health domains. */
  structuredExtractionRules?: StructuredExtractionRule[];

  // === Extraction Reflection ===
  /** Enable a second LLM call to validate/enrich extracted facts. Default: false (opt-in). */
  enableReflection?: boolean;
  /** Optional custom prompt override for the reflection LLM call. */
  reflectionPrompt?: string;

  // === Formatter Overhaul ===
  /** Split context into stable prefix (profile + pinned) and dynamic suffix (retrieved) for LLM caching. Default: false (opt-in). */
  cacheableContext?: boolean;
  /** Prepend priority markers ([CRITICAL], [IMPORTANT], [INFO]) to each memory line. Default: true. */
  prioritySignaling?: boolean;
  /** Sort retrieved memories by createdAt and group by month/year with date headers. Default: true. */
  chronologicalRetrieval?: boolean;
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
  triggerDormantTransition(threadId: string): Promise<{
      memoriesSaved: number;
      memoriesDeduped: number;
      memoriesSuperseded: number;
      totalExtracted: number;
      profileFieldsUpdated: number;
    }>;
  closeThread(threadId: string): Promise<void>;
  sweepThreads(): Promise<void>;
  deleteMemory(memoryId: string): Promise<void>;
  deleteUserData(userId: string): Promise<void>;

  /** Get a user's structured profile. Returns null if profile storage is not supported or no profile exists. */
  getProfile(userId: string): Promise<UserProfile | null>;
  /** Update a user's structured profile (merge semantics). No-op if profile storage is not supported. */
  updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId">>): Promise<void>;
}
