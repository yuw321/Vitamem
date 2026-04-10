import { NextResponse } from "next/server";
import { getVitamem } from "@/lib/vitamem-instance";

export async function POST() {
  try {
    const vm = await getVitamem();

    // sweepThreads() returns void — it transitions threads based on timeouts
    // We cannot get detailed per-thread results from the facade,
    // so we return a success acknowledgment.
    await vm.sweepThreads();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
