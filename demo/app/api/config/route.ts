import { NextResponse } from "next/server";
import { getConfig } from "@/lib/vitamem-instance";

export async function GET() {
  try {
    const config = getConfig();
    return NextResponse.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
