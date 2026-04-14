import { MemoryMatch } from "../types.js";
import { cosineSimilarity } from "../memory/deduplication.js";

/** Default half-life: 180 days in milliseconds */
const DEFAULT_HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;

type DateLike = Date | string | undefined | null;

/** Safely extract a ms timestamp from a Date object or ISO string. */
function toTimestamp(d: DateLike): number | null {
  if (d == null) return null;
  if (d instanceof Date) return d.getTime();
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Apply recency weighting to memory matches.
 * Blends cosine similarity with a time-decay factor.
 *
 * @param results - Memory matches (must have createdAt populated)
 * @param recencyWeight - 0-1 blend factor (0 = pure similarity, 1 = pure recency)
 * @param maxAgeMs - Normalization window in ms (default: 90 days)
 * @returns Re-scored and re-sorted results
 */
export function applyRecencyWeighting(
  results: MemoryMatch[],
  recencyWeight: number,
  maxAgeMs: number = 90 * 24 * 60 * 60 * 1000,
): MemoryMatch[] {
  if (recencyWeight <= 0 || results.length === 0) return results;

  const now = Date.now();

  return results
    .map((r) => {
      const createdTs = toTimestamp(r.createdAt as DateLike);
      const ageMs = createdTs !== null ? now - createdTs : maxAgeMs;
      const recencyFactor = Math.max(0, 1 - ageMs / maxAgeMs);
      const finalScore =
        r.score * (1 - recencyWeight) + recencyFactor * recencyWeight;
      return { ...r, score: finalScore };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Apply active-forgetting decay to memory match scores.
 * Memories that haven't been retrieved recently get a score penalty.
 * Pinned memories are exempt from decay.
 *
 * @param results - Memory matches to apply decay to
 * @param config - Forgetting configuration with optional halfLife
 * @returns Re-scored and re-sorted results
 */
export function applyDecay(
  results: MemoryMatch[],
  config: { forgettingHalfLifeMs?: number },
): MemoryMatch[] {
  if (results.length === 0) return results;

  const halfLife = config.forgettingHalfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const now = Date.now();

  return results
    .map((r) => {
      // Pinned memories are exempt from decay
      if (r.pinned) return r;

      const lastRetrievedTs = toTimestamp(r.lastRetrievedAt as DateLike);
      const createdTs = toTimestamp(r.createdAt as DateLike);
      const referenceTime = lastRetrievedTs ?? createdTs ?? now;

      const timeSinceLastRetrieval = now - referenceTime;

      // Base decay factor: inversely proportional to time since last retrieval
      // decayFactor = max(0.1, 1 - (timeSinceLastRetrieval / (2 * halfLife)))
      let decayFactor = Math.max(
        0.1,
        1 - timeSinceLastRetrieval / (2 * halfLife),
      );

      // Retrieval count bonus: frequently retrieved memories resist decay
      const retrievalCount = r.retrievalCount ?? 0;
      if (retrievalCount > 0) {
        // Each retrieval adds a small boost (diminishing returns via log)
        const retrievalBoost = Math.min(0.3, Math.log1p(retrievalCount) * 0.1);
        decayFactor = Math.min(1, decayFactor + retrievalBoost);
      }

      return { ...r, score: r.score * decayFactor };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Apply Maximal Marginal Relevance (MMR) for diverse retrieval.
 * Iteratively selects candidates that balance relevance with diversity.
 *
 * @param candidates - Sorted memory matches with embeddings
 * @param diversityWeight - 0-1 (0 = pure relevance, 1 = max diversity)
 * @param limit - Max number of results to return
 * @returns Diversified results
 */
export function applyMMR(
  candidates: MemoryMatch[],
  diversityWeight: number,
  limit: number,
): MemoryMatch[] {
  if (diversityWeight <= 0 || candidates.length <= limit) return candidates;

  // Filter to only candidates with embeddings
  const withEmbeddings = candidates.filter((c) => c.embedding && c.embedding.length > 0);
  const withoutEmbeddings = candidates.filter((c) => !c.embedding || c.embedding.length === 0);

  if (withEmbeddings.length === 0) return candidates.slice(0, limit);

  const selected: MemoryMatch[] = [];
  const remaining = [...withEmbeddings];

  // Pick highest-scoring candidate first
  selected.push(remaining.splice(0, 1)[0]);

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score;
      const maxSimToSelected = Math.max(
        ...selected.map((s) =>
          cosineSimilarity(remaining[i].embedding!, s.embedding!),
        ),
      );
      const mmrScore =
        relevance * (1 - diversityWeight) - maxSimToSelected * diversityWeight;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  // Append any without embeddings at the end (up to limit)
  const combined = [...selected, ...withoutEmbeddings].slice(0, limit);
  return combined;
}
