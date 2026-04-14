import { NextRequest, NextResponse } from "next/server";
import { getConfig, updateVitamemConfig } from "@/lib/vitamem-instance";

export async function GET() {
  try {
    const config = getConfig();
    return NextResponse.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Build a partial VitamemConfig from the incoming JSON
    const updates: Record<string, unknown> = {};

    if (typeof body.enableReflection === "boolean") {
      updates.enableReflection = body.enableReflection;
    }
    if (typeof body.prioritySignaling === "boolean") {
      updates.prioritySignaling = body.prioritySignaling;
    }
    if (typeof body.chronologicalRetrieval === "boolean") {
      updates.chronologicalRetrieval = body.chronologicalRetrieval;
    }
    if (typeof body.cacheableContext === "boolean") {
      updates.cacheableContext = body.cacheableContext;
    }
    if (body.forgetting !== undefined) {
      updates.forgetting = body.forgetting;
    }

    await updateVitamemConfig(updates);
    const config = getConfig();
    return NextResponse.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
