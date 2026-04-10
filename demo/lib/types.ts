import type { MemorySource, ThreadState, MemoryMatch } from "vitamem";

// Re-export useful Vitamem types
export type { MemorySource, ThreadState, MemoryMatch };

// ---------------------------------------------------------------------------
// API request / response shapes
// ---------------------------------------------------------------------------

/** POST /api/chat */
export interface ChatRequest {
  message: string;
  threadId?: string;
}

export interface ChatResponse {
  reply: string;
  thread: {
    id: string;
    state: string;
  };
  memories?: Array<{
    content: string;
    source: string;
    score: number;
    tags?: string[];
  }>;
  redirected?: boolean;
  previousThreadId?: string;
}

// ---------------------------------------------------------------------------
// SSE event types (streaming chat)
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: "meta"; thread: { id: string; state: string }; memories?: Array<{ content: string; source: string; score?: number; tags?: string[] }>; redirected?: boolean; previousThreadId?: string }
  | { type: "delta"; chunk: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** GET /api/thread?id=... */
export interface ThreadResponse {
  id: string;
  userId: string;
  state: ThreadState;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
  }>;
}

/** GET /api/memories?userId=... */
export interface MemoryResponse {
  memories: Array<{
    id: string;
    content: string;
    source: MemorySource;
    pinned?: boolean;
    tags?: string[];
    createdAt: string;
  }>;
}

/** POST /api/search */
export interface SearchRequest {
  query: string;
  limit?: number;
  filterTags?: string[];
}

export interface SearchResponse {
  results: Array<{
    content: string;
    source: string;
    score: number;
    tags?: string[];
  }>;
}

/** POST /api/pipeline (trigger dormant transition) */
export interface PipelineRequest {
  threadId: string;
}

export interface PipelineResponse {
  success: boolean;
  threadId: string;
  state: string;
}

/** GET /api/config */
export interface ConfigResponse {
  provider: string;
  preset: string;
  autoRetrieve: boolean;
  minScore: number;
  recencyWeight: number;
  diversityWeight: number;
  coolingTimeoutMs: number | null;
  dormantTimeoutMs: number | null;
  closedTimeoutMs: number | null;
  demoUserId: string;
}
