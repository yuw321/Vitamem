import { NextRequest, NextResponse } from "next/server";
import { getVitamem, getDemoUserId } from "@/lib/vitamem-instance";
import type { ChatRequest, ChatResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { message, threadId } = body;

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const vm = await getVitamem();
    const userId = getDemoUserId();

    // Resolve thread: verify it exists, auto-create if missing (e.g. after server restart)
    let resolvedThreadId = threadId;
    if (resolvedThreadId) {
      const existingThread = await vm.getThread(resolvedThreadId);
      if (!existingThread) {
        // Thread was lost (e.g., server restart with in-memory storage)
        // Auto-create a new thread instead of crashing
        const newThread = await vm.createThread({ userId });
        resolvedThreadId = newThread.id;
      }
    }
    if (!resolvedThreadId) {
      const thread = await vm.createThread({ userId });
      resolvedThreadId = thread.id;
    }

    // ── SSE streaming path ──
    const wantsStream = request.headers
      .get("accept")
      ?.includes("text/event-stream");

    if (wantsStream) {
      const { stream, thread, memories, redirected, previousThreadId } =
        await vm.chatStream({ threadId: resolvedThreadId, message });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            // Send metadata first so client knows thread info immediately
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "meta",
                  thread: { id: thread.id, state: thread.state },
                  memories: memories?.map((m) => ({
                    content: m.content,
                    source: m.source,
                    score: m.score,
                    tags: m.tags,
                  })),
                  redirected,
                  previousThreadId,
                })}\n\n`,
              ),
            );

            // Stream text chunks
            for await (const chunk of stream) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "delta", chunk })}\n\n`,
                ),
              );
            }

            // Signal completion
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done" })}\n\n`,
              ),
            );
            controller.close();
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: String(err),
                })}\n\n`,
              ),
            );
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // ── Existing non-streaming JSON path ──
    const result = await vm.chat({ threadId: resolvedThreadId, message });

    const response: ChatResponse = {
      reply: result.reply,
      thread: {
        id: result.thread.id,
        state: result.thread.state,
      },
      memories: result.memories?.map((m) => ({
        content: m.content,
        source: m.source,
        score: m.score,
        tags: m.tags,
      })),
      redirected: result.redirected,
      previousThreadId: result.previousThreadId,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("[chat route error]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
