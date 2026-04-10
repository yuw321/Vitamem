import { NextRequest, NextResponse } from "next/server";
import { getVitamem, getDemoUserId, getConfig } from "@/lib/vitamem-instance";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const limitParam = searchParams.get("limit");

    if (!query) {
      return NextResponse.json(
        { error: "query parameter is required" },
        { status: 400 },
      );
    }

    const limit = limitParam ? Number(limitParam) : 10;
    const vm = await getVitamem();
    const userId = getDemoUserId();

    const results = await vm.retrieve({ userId, query, limit });

    const config = getConfig();

    return NextResponse.json({
      results: results.map((m) => ({
        content: m.content,
        source: m.source,
        score: m.score,
        pinned: m.pinned,
        tags: m.tags,
      })),
      settings: {
        minScore: config.minScore,
        recencyWeight: config.recencyWeight,
        diversityWeight: config.diversityWeight,
        autoRetrieve: config.autoRetrieve,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
