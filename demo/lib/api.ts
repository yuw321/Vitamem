import type { ChatResponse, ConfigResponse, SSEEvent } from "./types";

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendMessage(
  message: string,
  threadId?: string
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, threadId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function sendMessageStream(
  message: string,
  threadId?: string,
  callbacks?: {
    onMeta?: (meta: {
      thread: { id: string; state: string };
      memories?: Array<{ content: string; source: string; score?: number; tags?: string[] }>;
      redirected?: boolean;
      previousThreadId?: string;
    }) => void;
    onDelta?: (chunk: string) => void;
    onDone?: () => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ message, threadId }),
  });

  if (!res.ok) {
    throw new Error(`Chat failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data: SSEEvent = JSON.parse(line.slice(6));
        switch (data.type) {
          case "meta":
            callbacks?.onMeta?.(data);
            break;
          case "delta":
            callbacks?.onDelta?.(data.chunk);
            break;
          case "done":
            callbacks?.onDone?.();
            break;
          case "error":
            callbacks?.onError?.(data.message);
            break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function createThread(): Promise<{
  thread: { id: string; state: string; userId: string };
}> {
  const res = await fetch("/api/thread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function listThreads(): Promise<{
  threads: Array<{
    id: string;
    state: string;
    messageCount: number;
    createdAt: string;
  }>;
}> {
  const res = await fetch("/api/thread");
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function triggerDormant(threadId: string): Promise<{
  extractedFacts: number;
  embeddingCount: number;
  deduplicatedCount: number;
  savedCount: number;
  thread: { id: string; state: string };
}> {
  const res = await fetch("/api/thread", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, action: "dormant" }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function closeThread(
  threadId: string
): Promise<{ thread: { id: string; state: string } }> {
  const res = await fetch("/api/thread", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, action: "close" }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export async function listMemories(): Promise<{
  memories: Array<{
    id: string;
    content: string;
    source: string;
    tags?: string[];
    pinned?: boolean;
    createdAt: string;
  }>;
}> {
  const res = await fetch("/api/memory");
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function searchMemories(
  query: string,
  limit?: number
): Promise<{
  results: Array<{
    content: string;
    source: string;
    score: number;
    pinned?: boolean;
    tags?: string[];
  }>;
}> {
  const params = new URLSearchParams({ query });
  if (limit) params.set("limit", String(limit));
  const res = await fetch(`/api/memory/search?${params}`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function pinMemory(memoryId: string): Promise<void> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pin", memoryId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
}

export async function unpinMemory(memoryId: string): Promise<void> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unpin", memoryId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", memoryId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export async function sweepThreads(): Promise<{ success: boolean }> {
  const res = await fetch("/api/sweep", { method: "POST" });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function getConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}
