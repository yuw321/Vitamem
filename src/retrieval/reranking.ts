import { MemoryMatch } from "../types.js";
import { cosineSimilarity } from "../memory/deduplication.js";

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
      const ageMs = r.createdAt ? now - r.createdAt.getTime() : maxAgeMs;
      const recencyFactor = Math.max(0, 1 - ageMs / maxAgeMs);
      const finalScore =
        r.score * (1 - recencyWeight) + recencyFactor * recencyWeight;
      return { ...r, score: finalScore };
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
