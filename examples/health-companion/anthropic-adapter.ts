/**
 * Vitamem — Anthropic Claude Health Companion Example
 *
 * Multi-session health companion using Claude for chat and
 * autoRetrieve for automatic memory injection.
 *
 * Set these environment variables:
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY  (for embeddings — Anthropic has no embedding API)
 */

import { createVitamem, createAnthropicAdapter } from "vitamem";

async function runHealthCompanionDemo() {
  const mem = await createVitamem({
    llm: createAnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      embeddingApiKey: process.env.OPENAI_API_KEY!,
    }),
    storage: "ephemeral",
    autoRetrieve: true, // memories automatically injected into chat context
  });

  const userId = "health-demo-user";

  // ── Session 1: First check-in ──

  console.log("=== Session 1: First check-in ===\n");

  const session1 = await mem.createThread({ userId });

  const messages1 = [
    "Hi! I've been managing Type 2 diabetes for about 3 years now.",
    "I take metformin 1000mg twice a day. My last A1C was 7.4.",
    "My doctor wants me to get it under 7.0. I've been trying to cut carbs.",
  ];

  for (const msg of messages1) {
    console.log("User:", msg);
    const { reply } = await mem.chat({ threadId: session1.id, message: msg });
    console.log("Companion:", reply);
    console.log();
  }

  // End session — extract memories
  console.log("(Session ended — extracting memories...)\n");
  await mem.triggerDormantTransition(session1.id);

  // ── Session 2: Return visit (with automatic memory retrieval) ──

  console.log("=== Session 2: Return visit ===\n");

  const session2 = await mem.createThread({ userId });

  // With autoRetrieve enabled, memories are automatically injected
  console.log("User: Hey, I'm back! Had a checkup yesterday.");
  const { reply, memories } = await mem.chat({
    threadId: session2.id,
    message: "Hey, I'm back! Had a checkup yesterday.",
  });

  console.log("Companion:", reply);

  if (memories && memories.length > 0) {
    console.log("\nMemories used in this response:");
    memories.forEach((m) =>
      console.log(`  [${m.source}] ${m.content} (score: ${m.score.toFixed(2)})`),
    );
  }
}

runHealthCompanionDemo().catch(console.error);
