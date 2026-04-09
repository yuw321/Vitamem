/**
 * Vitamem — OpenAI Example
 *
 * Minimal example using OpenAI with the unified config API.
 * Set OPENAI_API_KEY in your environment.
 */

import { createVitamem } from "vitamem";

async function main() {
  // 3-line setup with string shortcuts
  const mem = await createVitamem({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    storage: "ephemeral",
  });

  // Create a thread and have a conversation
  const thread = await mem.createThread({ userId: "example-user" });

  console.log("Starting conversation...");
  const { reply: r1 } = await mem.chat({
    threadId: thread.id,
    message:
      "Hi! I'm managing Type 2 diabetes and take metformin 500mg twice daily.",
  });
  console.log("Assistant:", r1);

  const { reply: r2 } = await mem.chat({
    threadId: thread.id,
    message: "I also try to walk 30 minutes every morning.",
  });
  console.log("Assistant:", r2);

  // Extract and store memories
  console.log("\nExtracting memories...");
  await mem.triggerDormantTransition(thread.id);

  // Retrieve memories
  const memories = await mem.retrieve({
    userId: "example-user",
    query: "health conditions and medications",
  });

  console.log("\nStored memories:");
  for (const m of memories) {
    console.log(`  [${m.source}] ${m.content} (score: ${m.score.toFixed(3)})`);
  }
}

main().catch(console.error);
