import { Thread, Message, LLMAdapter, StorageAdapter, AutoPinRule, MemorySource, StructuredExtractionRule } from "../types.js";
import { extractMemories, ExtractedFact } from "../memory/extraction.js";
import { classifyFact } from "../memory/deduplication.js";
import { classifyStructuredFacts, applyStructuredFacts } from "../memory/structured-extraction.js";
import { reflectOnExtraction, applyReflectionResult } from "../memory/reflection.js";

export interface EmbeddingPipelineResult {
  memoriesSaved: number;
  memoriesDeduped: number;
  memoriesSuperseded: number;
  totalExtracted: number;
  profileFieldsUpdated: number;
  /** Reflection stats (only present when enableReflection is true) */
  reflection?: {
    factsModified: number;
    factsRemoved: number;
    missedFactsAdded: number;
    conflictsFound: number;
  };
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
  structuredRules?: StructuredExtractionRule[],
  enableReflection = false,
  reflectionPrompt?: string,
): Promise<EmbeddingPipelineResult> {
  // Derive session date from thread metadata (YYYY-MM-DD)
  const sessionDateSource = thread.lastMessageAt ?? thread.createdAt;
  const sessionDate = sessionDateSource.toISOString().slice(0, 10);

  // Step 1: Extract facts
  let extractedFacts: ExtractedFact[];
  try {
    extractedFacts = await extractMemories(messages, llm, sessionDate);
  } catch (extractError) {
    console.error('[vitamem:pipeline] extraction failed:', extractError);
    extractedFacts = [];
  }
  const totalExtracted = extractedFacts.length;

  if (totalExtracted === 0) {
    return { memoriesSaved: 0, memoriesDeduped: 0, memoriesSuperseded: 0, totalExtracted: 0, profileFieldsUpdated: 0 };
  }

  // Step 1a: Reflection pass (optional — validates/enriches extracted facts)
  let reflectionStats: EmbeddingPipelineResult['reflection'] | undefined;
  if (enableReflection) {
    try {
      const existingMemories = await storage.getMemories(thread.userId);
      const existingForReflection = existingMemories.map(m => ({ content: m.content, source: m.source }));
      const originalMessages = messages.map(m => ({ role: m.role, content: m.content }));

      const reflectionResult = await reflectOnExtraction(
        extractedFacts,
        existingForReflection,
        originalMessages,
        llm,
        reflectionPrompt,
      );

      const factsModified = reflectionResult.correctedFacts.filter(f => f.action === 'enrich').length;
      const factsRemoved = reflectionResult.correctedFacts.filter(f => f.action === 'remove').length;
      const missedFactsAdded = reflectionResult.missedFacts.length;
      const conflictsFound = reflectionResult.conflicts.length;

      reflectionStats = { factsModified, factsRemoved, missedFactsAdded, conflictsFound };

      // Replace extracted facts with reflection output
      extractedFacts = applyReflectionResult(reflectionResult);
    } catch (reflectionError) {
      console.warn('[vitamem:reflection] Reflection step failed, using original facts:', reflectionError);
    }
  }

  // Step 1b: Classify structured facts (if rules provided)
  let profileFieldsUpdated = 0;
  let factsForEmbedding: ExtractedFact[] = extractedFacts;

  if (structuredRules && structuredRules.length > 0 && storage.updateProfileField) {
    const classified = classifyStructuredFacts(extractedFacts, structuredRules);
    profileFieldsUpdated = await applyStructuredFacts(thread.userId, classified.structured, storage);
    factsForEmbedding = classified.freeform;
  }

  if (factsForEmbedding.length === 0) {
    return { memoriesSaved: 0, memoriesDeduped: 0, memoriesSuperseded: 0, totalExtracted, profileFieldsUpdated };
  }

  // Step 2: Embed each fact (with concurrency limit)
  const embeddings = await mapWithConcurrency(
    factsForEmbedding,
    (fact) => llm.embed(fact.content),
    embeddingConcurrency,
  );

  const factsWithEmbeddings = factsForEmbedding.map((fact, i) => ({
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
        // existingIndex is into the combined [existingMemories, ...inBatch] array.
        // Only supersede when it refers to an actual persisted memory.
        const isPersistedMemory = classification.existingIndex < existingMemories.length;
        const existing = isPersistedMemory ? existingMemories[classification.existingIndex] : undefined;
        if (storage.updateMemory && existing?.id) {
          const pinned = shouldAutoPin(fact.content, fact.source ?? "inferred", fact.tags, autoPinRules);
          // Preserve higher-confidence source: never downgrade "confirmed" → "inferred"
          const preservedSource = existing.source === "confirmed" ? "confirmed" : fact.source ?? "inferred";
          // Preserve pinned status: if existing was pinned, keep it pinned
          const preservedPinned = existing.pinned || pinned;
          await storage.updateMemory(existing.id, {
            content: fact.content,
            embedding: fact.embedding,
            source: preservedSource,
            tags: fact.tags,
            ...(preservedPinned && { pinned: true }),
          });
          memoriesSuperseded++;
        } else if (isPersistedMemory) {
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
        } else {
          // Best match is an in-batch entry from this same extraction run — skip
          memoriesDeduped++;
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

  return { memoriesSaved, memoriesDeduped, memoriesSuperseded, totalExtracted, profileFieldsUpdated, ...(reflectionStats && { reflection: reflectionStats }) };
}

