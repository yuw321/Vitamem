import { NextRequest, NextResponse } from "next/server";
import { getVitamem, getDemoUserId, getStorage } from "@/lib/vitamem-instance";

// Track created thread IDs on globalThis to survive Next.js dev-mode hot-reloads
const globalForThreads = globalThis as unknown as { trackedThreadIds?: Set<string> };
if (!globalForThreads.trackedThreadIds) {
  globalForThreads.trackedThreadIds = new Set<string>();
}
const trackedThreadIds = globalForThreads.trackedThreadIds;

export async function GET() {
  try {
    const vm = await getVitamem();
    const storage = getStorage();
    const userId = getDemoUserId();

    // Collect threads from all known states via storage adapter
    const threads: Array<{
      id: string;
      state: string;
      messageCount: number;
      createdAt: string;
    }> = [];

    if (storage.getThreadsByState) {
      const states = ["active", "cooling", "dormant", "closed"] as const;
      for (const state of states) {
        const stateThreads = await storage.getThreadsByState(state);
        for (const t of stateThreads) {
          if (t.userId === userId) {
            const messages = await storage.getMessages(t.id);
            threads.push({
              id: t.id,
              state: t.state,
              messageCount: messages.length,
              createdAt: t.createdAt.toISOString(),
            });
          }
        }
      }
    } else {
      // Fallback: use tracked thread IDs
      for (const id of trackedThreadIds) {
        const t = await vm.getThread(id);
        if (t && t.userId === userId) {
          const messages = await storage.getMessages(t.id);
          threads.push({
            id: t.id,
            state: t.state,
            messageCount: messages.length,
            createdAt: t.createdAt.toISOString(),
          });
        }
      }
    }

    return NextResponse.json({ threads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || getDemoUserId();

    const vm = await getVitamem();
    const thread = await vm.createThread({ userId });

    trackedThreadIds.add(thread.id);

    return NextResponse.json({
      thread: {
        id: thread.id,
        state: thread.state,
        userId: thread.userId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, action } = body as {
      threadId: string;
      action: "dormant" | "close";
    };

    if (!threadId || !action) {
      return NextResponse.json(
        { error: "threadId and action are required" },
        { status: 400 },
      );
    }

    const vm = await getVitamem();

    if (action === "dormant") {
      const pipelineResult = await vm.triggerDormantTransition(threadId);

      const thread = await vm.getThread(threadId);

      // Surface reflection metadata if reflection ran
      const reflectionResult = (pipelineResult as any).reflection
        ? {
            correctionsCount: (pipelineResult as any).reflection.factsModified ?? 0,
            missedFactsCount: (pipelineResult as any).reflection.missedFactsAdded ?? 0,
            conflictsCount: (pipelineResult as any).reflection.conflictsFound ?? 0,
          }
        : undefined;

      return NextResponse.json({
        extractedFacts: pipelineResult.totalExtracted,
        embeddingCount: pipelineResult.totalExtracted,
        deduplicatedCount: pipelineResult.memoriesDeduped,
        savedCount: pipelineResult.memoriesSaved,
        memoriesSuperseded: pipelineResult.memoriesSuperseded,
        profileFieldsUpdated: pipelineResult.profileFieldsUpdated ?? 0,
        reflectionResult,
        reflectionEnabled: !!reflectionResult,
        thread: thread
          ? { id: thread.id, state: thread.state }
          : { id: threadId, state: "dormant" },
      });
    }

    if (action === "close") {
      await vm.closeThread(threadId);
      const thread = await vm.getThread(threadId);

      return NextResponse.json({
        thread: thread
          ? { id: thread.id, state: thread.state }
          : { id: threadId, state: "closed" },
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
