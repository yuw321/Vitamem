import { Memory, MemoryMatch, FactClassification } from '../types.js';

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) {
    throw new Error('Cannot compute cosine similarity of zero-length vectors');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Check if a new memory is a duplicate of any existing memory.
 * A duplicate is defined as cosine similarity >= threshold (default: 0.92).
 */
export function isDuplicate(
  newEmbedding: number[],
  existingMemories: Array<{ embedding: number[] | null }>,
  threshold = 0.92,
): boolean {
  for (const existing of existingMemories) {
    if (!existing.embedding) continue;
    const similarity = cosineSimilarity(newEmbedding, existing.embedding);
    if (similarity >= threshold) return true;
  }
  return false;
}

/**
 * Find the most similar existing memory, if any exceeds the threshold.
 * Returns the index and similarity score, or null if no match.
 */
export function findMostSimilar(
  newEmbedding: number[],
  existingMemories: Array<{ embedding: number[] | null }>,
  threshold = 0.92,
): { index: number; similarity: number } | null {
  let bestIndex = -1;
  let bestSimilarity = -1;

  for (let i = 0; i < existingMemories.length; i++) {
    const existing = existingMemories[i];
    if (!existing.embedding) continue;
    const similarity = cosineSimilarity(newEmbedding, existing.embedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex === -1 || bestSimilarity < threshold) return null;
  return { index: bestIndex, similarity: bestSimilarity };
}

/**
 * Deduplicate a batch of new facts against existing memories.
 * Returns only the facts that are NOT duplicates.
 */
export function deduplicateFacts(
  newFacts: Array<{ content: string; embedding: number[] }>,
  existingMemories: Array<{ embedding: number[] | null }>,
  threshold = 0.92,
): Array<{ content: string; embedding: number[] }> {
  const unique: Array<{ content: string; embedding: number[] }> = [];

  // Also check against already-accepted new facts
  const accepted: Array<{ embedding: number[] }> = [...existingMemories.filter(m => m.embedding !== null) as Array<{ embedding: number[] }>];

  for (const fact of newFacts) {
    if (!isDuplicate(fact.embedding, accepted, threshold)) {
      unique.push(fact);
      accepted.push({ embedding: fact.embedding });
    }
  }

  return unique;
}

/**
 * Classify a new fact against existing memories using two-tier thresholds.
 * - >= deduplicationThreshold: exact duplicate, skip
 * - >= supersedeThreshold and < deduplicationThreshold: same topic updated, supersede
 * - < supersedeThreshold: new distinct fact, save
 */
export function classifyFact(
  newEmbedding: number[],
  existingMemories: Array<{ embedding: number[] | null }>,
  deduplicationThreshold: number,
  supersedeThreshold: number,
): FactClassification {
  let bestIndex = -1;
  let bestSimilarity = -1;

  for (let i = 0; i < existingMemories.length; i++) {
    const existing = existingMemories[i];
    if (!existing.embedding) continue;
    const similarity = cosineSimilarity(newEmbedding, existing.embedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0 && bestSimilarity >= deduplicationThreshold) {
    return { action: "skip" };
  }

  if (bestIndex >= 0 && bestSimilarity >= supersedeThreshold) {
    return { action: "supersede", existingIndex: bestIndex, similarity: bestSimilarity };
  }

  return { action: "save" };
}
