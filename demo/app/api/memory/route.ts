import { NextRequest, NextResponse } from "next/server";
import { getVitamem, getDemoUserId, getStorage } from "@/lib/vitamem-instance";

export async function GET() {
  try {
    await getVitamem(); // ensure initialized
    const storage = getStorage();
    const userId = getDemoUserId();

    const memories = await storage.getMemories(userId);

    return NextResponse.json({
      memories: memories.map((m) => ({
        id: m.id,
        content: m.content,
        source: m.source,
        tags: m.tags,
        pinned: m.pinned ?? false,
        createdAt: m.createdAt.toISOString(),
        userId: m.userId,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, memoryId } = body as {
      action: "pin" | "unpin" | "delete";
      memoryId: string;
    };

    if (!action || !memoryId) {
      return NextResponse.json(
        { error: "action and memoryId are required" },
        { status: 400 },
      );
    }

    const vm = await getVitamem();

    switch (action) {
      case "pin":
        await vm.pinMemory(memoryId);
        break;
      case "unpin":
        await vm.unpinMemory(memoryId);
        break;
      case "delete":
        await vm.deleteMemory(memoryId);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const vm = await getVitamem();
    await vm.deleteUserData(userId);

    return NextResponse.json({ success: true, deletedUserId: userId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
