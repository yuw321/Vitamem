import { Thread, Message, LLMAdapter, StorageAdapter, AutoPinRule, MemorySource } from "../types.js";
import { extractMemories } from "../memory/extraction.js";
import { classifyFact } from "../memory/deduplication.js";

export interface EmbeddingPipelineResult {
  memoriesSaved: number;
  memoriesDeduped: number;
  memoriesSuperseded: number;
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
/**
 * Check if a memory should be automatically pinned based on configured rules.
 */
function shouldAutoPin(
  content: string,
  source: MemorySource,
  tags: string[] | undefined,
  rules: AutoPinRule[],
): boolean {
  for (const rule of rules) {
    if ("pattern" in rule) {
      if (rule.pattern.test(content)) return true;
    } else {
      if (rule.test({ content, source, tags })) return true;
    }
  }
  return false;
}

export async function runEmbeddingPipeline(
  thread: Thread,
  messages: Message[],
  llm: LLMAdapter,
  storage: StorageAdapter,
  deduplicationThreshold = 0.92,
  supersedeThreshold = 0.75,
  embeddingConcurrency = 5,
  autoPinRules: AutoPinRule[] = [],
): Promise<EmbeddingPipelineResult> {
  // Step 1: Extract facts
  const extractedFacts = await extractMemories(messages, llm);
  const totalExtracted = extractedFacts.length;

  if (totalExtracted === 0) {
    return { memoriesSaved: 0, memoriesDeduped: 0, memoriesSuperseded: 0, totalExtracted: 0 };
  }

  // Step 2: Embed each fact (with concurrency limit)
  const embeddings = await mapWithConcurrency(
    extractedFacts,
    (fact) => llm.embed(fact.content),
    embeddingConcurrency,
  );

  const factsWithEmbeddings = extractedFacts.map((fact, i) => ({
    content: fact.content,
    source: fact.source,
    tags: fact.tags,
    embedding: embeddings[i],
  }));

  // Step 3: Get existing memories for deduplication
  const existingMemories = await storage.getMemories(thread.userId);

  // Step 4: Classify and process each fact
  let memoriesSaved = 0;
  let memoriesDeduped = 0;
  let memoriesSuperseded = 0;

  // Track accepted embeddings to prevent intra-batch duplicates
  const acceptedEmbeddings: Array<{ embedding: number[] }> = [
    ...existingMemories.filter(m => m.embedding !== null) as Array<{ embedding: number[] }>
  ];

  for (const fact of factsWithEmbeddings) {
    const classification = classifyFact(
      fact.embedding,
      [...existingMemories, ...acceptedEmbeddings.slice(existingMemories.filter(m => m.embedding !== null).length)],
      deduplicationThreshold,
      supersedeThreshold,
    );

    switch (classification.action) {
      case "skip":
        memoriesDeduped++;
        break;

      case "supersede": {
        // Update the existing memory with new content and embedding
        const existing = existingMemories[classification.existingIndex];
        if (storage.updateMemory && existing?.id) {
          const pinned = shouldAutoPin(fact.content, fact.source ?? "inferred", fact.tags, autoPinRules);
          await storage.updateMemory(existing.id, {
            content: fact.content,
            embedding: fact.embedding,
            source: fact.source ?? "inferred",
            tags: fact.tags,
            ...(pinned && { pinned: true }),
          });
          memoriesSuperseded++;
        } else {
          // Fallback: if updateMemory not available, save as new
          const pinned = shouldAutoPin(fact.content, fact.source ?? "inferred", fact.tags, autoPinRules);
          await storage.saveMemory({
            userId: thread.userId,
            threadId: thread.id,
            content: fact.content,
            source: fact.source ?? "inferred",
            embedding: fact.embedding,
            tags: fact.tags,
            pinned,
          });
          memoriesSaved++;
        }
        acceptedEmbeddings.push({ embedding: fact.embedding });
        break;
      }

      case "save": {
        const pinned = shouldAutoPin(fact.content, fact.source ?? "inferred", fact.tags, autoPinRules);
        await storage.saveMemory({
          userId: thread.userId,
          threadId: thread.id,
          content: fact.content,
          source: fact.source ?? "inferred",
          embedding: fact.embedding,
          tags: fact.tags,
          pinned,
        });
        memoriesSaved++;
        acceptedEmbeddings.push({ embedding: fact.embedding });
        break;
      }
    }
  }

  return { memoriesSaved, memoriesDeduped, memoriesSuperseded, totalExtracted };
}
