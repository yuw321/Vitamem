import { NextRequest, NextResponse } from "next/server";
import { getVitamem, getDemoUserId } from "@/lib/vitamem-instance";
import { createEmptyProfile } from "vitamem";

export async function GET(request: NextRequest) {
  try {
    const userId =
      request.nextUrl.searchParams.get("userId") || getDemoUserId();
    const vm = await getVitamem();
    const profile = await vm.getProfile(userId);

    return NextResponse.json({
      profile: profile ?? createEmptyProfile(userId),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
