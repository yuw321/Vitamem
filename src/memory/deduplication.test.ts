import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  isDuplicate,
  findMostSimilar,
  deduplicateFacts,
} from './deduplication.js';

// ── cosineSimilarity ──

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns 1 for parallel vectors with different magnitudes', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // same direction, 2x magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('handles negative values correctly', () => {
    const a = [1, -1, 0];
    const b = [-1, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('returns a value between -1 and 1 for arbitrary vectors', () => {
    const a = [0.3, 0.7, -0.1, 0.5];
    const b = [0.8, 0.2, 0.4, -0.3];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('throws for dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('dimension mismatch');
  });

  it('throws for zero-length vectors', () => {
    expect(() => cosineSimilarity([], [])).toThrow('zero-length');
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('handles high-dimensional vectors', () => {
    const dim = 1536; // OpenAI embedding dimension
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

// ── isDuplicate ──

describe('isDuplicate', () => {
  const baseEmbedding = [1, 0, 0];
  const similarEmbedding = [0.99, 0.1, 0.01]; // very similar to base
  const differentEmbedding = [0, 1, 0]; // orthogonal

  it('returns true when similarity exceeds threshold', () => {
    const existing = [{ embedding: baseEmbedding }];
    expect(isDuplicate(baseEmbedding, existing, 0.92)).toBe(true);
  });

  it('returns false when similarity is below threshold', () => {
    const existing = [{ embedding: differentEmbedding }];
    expect(isDuplicate(baseEmbedding, existing, 0.92)).toBe(false);
  });

  it('returns false for empty existing memories', () => {
    expect(isDuplicate(baseEmbedding, [], 0.92)).toBe(false);
  });

  it('skips existing memories with null embeddings', () => {
    const existing = [{ embedding: null }, { embedding: differentEmbedding }];
    expect(isDuplicate(baseEmbedding, existing, 0.92)).toBe(false);
  });

  it('uses custom threshold', () => {
    const existing = [{ embedding: similarEmbedding }];
    // With very high threshold, similar vectors might not match
    const sim = cosineSimilarity(baseEmbedding, similarEmbedding);
    expect(isDuplicate(baseEmbedding, existing, sim + 0.01)).toBe(false);
    expect(isDuplicate(baseEmbedding, existing, sim - 0.01)).toBe(true);
  });

  it('matches against any memory in the list', () => {
    const existing = [
      { embedding: differentEmbedding },
      { embedding: differentEmbedding },
      { embedding: baseEmbedding }, // this one matches
    ];
    expect(isDuplicate(baseEmbedding, existing, 0.92)).toBe(true);
  });
});

// ── findMostSimilar ──

describe('findMostSimilar', () => {
  it('returns null when no memories exist', () => {
    expect(findMostSimilar([1, 0, 0], [])).toBeNull();
  });

  it('returns null when no memory exceeds threshold', () => {
    const existing = [{ embedding: [0, 1, 0] }];
    expect(findMostSimilar([1, 0, 0], existing, 0.92)).toBeNull();
  });

  it('returns the most similar memory index and score', () => {
    const query = [1, 0, 0];
    const existing = [
      { embedding: [0, 1, 0] },    // orthogonal
      { embedding: [0.99, 0.1, 0] }, // very similar
      { embedding: [0.5, 0.5, 0] },  // somewhat similar
    ];

    const result = findMostSimilar(query, existing, 0.5);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
    expect(result!.similarity).toBeGreaterThan(0.9);
  });

  it('skips memories with null embeddings', () => {
    const query = [1, 0, 0];
    const existing = [
      { embedding: null },
      { embedding: [0.99, 0.1, 0] },
    ];

    const result = findMostSimilar(query, existing, 0.5);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
  });
});

// ── deduplicateFacts ──

describe('deduplicateFacts', () => {
  it('returns all facts when no existing memories', () => {
    const facts = [
      { content: 'Fact A', embedding: [1, 0, 0] },
      { content: 'Fact B', embedding: [0, 1, 0] },
    ];

    const result = deduplicateFacts(facts, [], 0.92);
    expect(result).toHaveLength(2);
  });

  it('filters out facts that match existing memories', () => {
    const facts = [
      { content: 'Prefers TypeScript', embedding: [1, 0, 0] },
      { content: 'Works in fintech', embedding: [0, 1, 0] },
    ];
    const existing = [
      { embedding: [1, 0, 0] }, // matches first fact exactly
    ];

    const result = deduplicateFacts(facts, existing, 0.92);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Works in fintech');
  });

  it('deduplicates within the new batch itself', () => {
    const facts = [
      { content: 'Prefers TypeScript', embedding: [1, 0, 0] },
      { content: 'Likes TypeScript', embedding: [1, 0, 0] }, // same embedding = duplicate
    ];

    const result = deduplicateFacts(facts, [], 0.92);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Prefers TypeScript');
  });

  it('keeps facts that are different enough from each other', () => {
    const facts = [
      { content: 'Prefers TypeScript', embedding: [1, 0, 0] },
      { content: 'Works in fintech', embedding: [0, 1, 0] },
      { content: 'Lives in NYC', embedding: [0, 0, 1] },
    ];

    const result = deduplicateFacts(facts, [], 0.92);
    expect(result).toHaveLength(3);
  });

  it('respects custom threshold', () => {
    const facts = [
      { content: 'Fact A', embedding: [1, 0, 0] },
      { content: 'Fact B', embedding: [0.95, 0.3, 0] }, // somewhat similar to A
    ];

    // With low threshold, B is considered a duplicate of A
    const strict = deduplicateFacts(facts, [], 0.8);
    expect(strict).toHaveLength(1);

    // With high threshold, B is unique
    const loose = deduplicateFacts(facts, [], 0.99);
    expect(loose).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(deduplicateFacts([], [], 0.92)).toEqual([]);
  });
});
