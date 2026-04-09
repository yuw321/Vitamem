import { Thread, Message, LLMAdapter, StorageAdapter } from "../types.js";
import { extractMemories } from "../memory/extraction.js";
import { deduplicateFacts } from "../memory/deduplication.js";

export interface EmbeddingPipelineResult {
  memoriesSaved: number;
  memoriesDeduped: number;
  totalExtracted: number;
}

/**
 * Process items with a concurrency limit.
 * Runs at most `concurrency` async operations at a time.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    results[i] = await fn(items[i]);
    await next();
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Run the full embedding pipeline for a thread that just went dormant.
 *
 * 1. Extract facts from messages via LLM
 * 2. Embed each extracted fact (with concurrency limit)
 * 3. Deduplicate against existing user memories
 * 4. Save new unique memories
 *
 * This is the "dormant transition trigger" — called when a thread
 * transitions to dormant state. Embeddings are computed ONCE here,
 * not at search time.
 */
export async function runEmbeddingPipeline(
  thread: Thread,
  messages: Message[],
  llm: LLMAdapter,
  storage: StorageAdapter,
  deduplicationThreshold = 0.92,
  concurrency = 5,
): Promise<EmbeddingPipelineResult> {
  // Step 1: Extract facts
  const extractedFacts = await extractMemories(messages, llm);
  const totalExtracted = extractedFacts.length;

  if (totalExtracted === 0) {
    return { memoriesSaved: 0, memoriesDeduped: 0, totalExtracted: 0 };
  }

  // Step 2: Embed each fact (with concurrency limit)
  const embeddings = await mapWithConcurrency(
    extractedFacts,
    (fact) => llm.embed(fact.content),
    concurrency,
  );

  const factsWithEmbeddings = extractedFacts.map((fact, i) => ({
    content: fact.content,
    source: fact.source,
    embedding: embeddings[i],
  }));

  // Step 3: Get existing memories for deduplication
  const existingMemories = await storage.getMemories(thread.userId);

  // Step 4: Deduplicate
  const uniqueFacts = deduplicateFacts(
    factsWithEmbeddings,
    existingMemories,
    deduplicationThreshold,
  );
  const memoriesDeduped = totalExtracted - uniqueFacts.length;

  // Step 5: Save unique memories
  const savePromises = uniqueFacts.map((fact) => {
    const factWithSource = factsWithEmbeddings.find(
      (f) => f.content === fact.content,
    );
    return storage.saveMemory({
      userId: thread.userId,
      threadId: thread.id,
      content: fact.content,
      source: factWithSource?.source ?? "inferred",
      embedding: fact.embedding,
    });
  });

  await Promise.all(savePromises);

  return {
    memoriesSaved: uniqueFacts.length,
    memoriesDeduped,
    totalExtracted,
  };
}
