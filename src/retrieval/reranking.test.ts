import { describe, it, expect } from "vitest";
import { applyRecencyWeighting, applyMMR, applyDecay } from "./reranking.js";
import { MemoryMatch } from "../types.js";

// ── applyRecencyWeighting ──

describe("applyRecencyWeighting", () => {
  it("returns results unchanged when recencyWeight is 0", () => {
    const results: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, createdAt: new Date(Date.now() - 1000) },
      { content: "B", source: "confirmed", score: 0.8, createdAt: new Date(Date.now() - 2000) },
    ];
    const out = applyRecencyWeighting(results, 0);
    expect(out).toBe(results); // same reference
  });

  it("returns empty array for empty input", () => {
    const out = applyRecencyWeighting([], 0.5);
    expect(out).toEqual([]);
  });

  it("boosts recent memories with positive recencyWeight", () => {
    const now = Date.now();
    const results: MemoryMatch[] = [
      { content: "Old high-score", source: "confirmed", score: 0.95, createdAt: new Date(now - 80 * 24 * 60 * 60 * 1000) },
      { content: "Recent low-score", source: "confirmed", score: 0.6, createdAt: new Date(now - 1000) },
    ];
    const out = applyRecencyWeighting(results, 0.8, 90 * 24 * 60 * 60 * 1000);
    // Recent memory should now rank higher due to strong recency weight
    expect(out[0].content).toBe("Recent low-score");
  });

  it("re-sorts by final score", () => {
    const now = Date.now();
    const results: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000) },
      { content: "B", source: "confirmed", score: 0.5, createdAt: new Date(now - 100) },
      { content: "C", source: "confirmed", score: 0.7, createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000) },
    ];
    const out = applyRecencyWeighting(results, 0.5);
    // Should be sorted descending by final score
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
  });

  it("treats missing createdAt as maximally old", () => {
    const results: MemoryMatch[] = [
      { content: "No date", source: "confirmed", score: 0.9 },
      { content: "Has date", source: "confirmed", score: 0.8, createdAt: new Date() },
    ];
    const out = applyRecencyWeighting(results, 0.5);
    // The one with date (recent) should get a recency boost
    expect(out[0].content).toBe("Has date");
  });

  it("clamps recency factor to 0 for very old memories", () => {
    const maxAge = 90 * 24 * 60 * 60 * 1000;
    const results: MemoryMatch[] = [
      { content: "Ancient", source: "confirmed", score: 0.9, createdAt: new Date(Date.now() - maxAge * 2) },
    ];
    const out = applyRecencyWeighting(results, 0.5, maxAge);
    // recencyFactor should be 0 (clamped), finalScore = 0.9 * 0.5 + 0 * 0.5 = 0.45
    expect(out[0].score).toBeCloseTo(0.45, 1);
  });
});

// ── applyMMR ──

describe("applyMMR", () => {
  it("returns candidates unchanged when diversityWeight is 0", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, embedding: [1, 0, 0] },
      { content: "B", source: "confirmed", score: 0.8, embedding: [0, 1, 0] },
    ];
    const out = applyMMR(candidates, 0, 5);
    expect(out).toBe(candidates);
  });

  it("returns candidates unchanged when count <= limit", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, embedding: [1, 0, 0] },
    ];
    const out = applyMMR(candidates, 0.5, 5);
    expect(out).toBe(candidates);
  });

  it("selects diverse candidates over redundant ones", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, embedding: [1, 0, 0] },
      { content: "A-similar", source: "confirmed", score: 0.85, embedding: [0.99, 0.1, 0] },
      { content: "B-different", source: "confirmed", score: 0.8, embedding: [0, 1, 0] },
      { content: "C-different", source: "confirmed", score: 0.7, embedding: [0, 0, 1] },
    ];
    const out = applyMMR(candidates, 0.7, 2);
    expect(out).toHaveLength(2);
    // First pick is always highest score
    expect(out[0].content).toBe("A");
    // Second should prefer diverse B over similar A-similar
    expect(out[1].content).toBe("B-different");
  });

  it("limits output to specified count", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, embedding: [1, 0, 0] },
      { content: "B", source: "confirmed", score: 0.8, embedding: [0, 1, 0] },
      { content: "C", source: "confirmed", score: 0.7, embedding: [0, 0, 1] },
      { content: "D", source: "confirmed", score: 0.6, embedding: [1, 1, 0] },
    ];
    const out = applyMMR(candidates, 0.3, 2);
    expect(out).toHaveLength(2);
  });

  it("handles candidates without embeddings gracefully", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9, embedding: [1, 0, 0] },
      { content: "B", source: "confirmed", score: 0.8 },
      { content: "C", source: "confirmed", score: 0.7, embedding: [0, 1, 0] },
      { content: "D", source: "confirmed", score: 0.6, embedding: [0, 0, 1] },
    ];
    const out = applyMMR(candidates, 0.5, 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it("returns original slice when all candidates lack embeddings", () => {
    const candidates: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.9 },
      { content: "B", source: "confirmed", score: 0.8 },
      { content: "C", source: "confirmed", score: 0.7 },
    ];
    const out = applyMMR(candidates, 0.5, 2);
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe("A");
    expect(out[1].content).toBe("B");
  });

  it("always picks highest-scoring candidate first", () => {
    const candidates: MemoryMatch[] = [
      { content: "Best", source: "confirmed", score: 0.95, embedding: [1, 0, 0] },
      { content: "Second", source: "confirmed", score: 0.9, embedding: [0.99, 0.1, 0] },
      { content: "Third", source: "confirmed", score: 0.85, embedding: [0.98, 0.2, 0] },
    ];
    const out = applyMMR(candidates, 0.5, 2);
    expect(out[0].content).toBe("Best");
  });
});

// ── applyDecay ──

describe("applyDecay", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HALF_LIFE = 180 * DAY_MS;

  it("returns empty array for empty input", () => {
    const out = applyDecay([], { forgettingHalfLifeMs: HALF_LIFE });
    expect(out).toEqual([]);
  });

  it("does not decay pinned memories", () => {
    const veryOld = new Date(Date.now() - HALF_LIFE * 3);
    const results: MemoryMatch[] = [
      { content: "Pinned old", source: "confirmed", score: 0.9, pinned: true, createdAt: veryOld },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    expect(out[0].score).toBe(0.9); // unchanged
  });

  it("penalizes old unretrieved memories", () => {
    const old = new Date(Date.now() - HALF_LIFE);
    const results: MemoryMatch[] = [
      { content: "Old memory", source: "confirmed", score: 0.8, createdAt: old },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    // decayFactor = max(0.1, 1 - HALF_LIFE/(2*HALF_LIFE)) = max(0.1, 0.5) = 0.5
    expect(out[0].score).toBeCloseTo(0.4, 1); // 0.8 * 0.5
  });

  it("recently retrieved memories resist decay", () => {
    const old = new Date(Date.now() - HALF_LIFE * 2);
    const recent = new Date(Date.now() - DAY_MS);
    const results: MemoryMatch[] = [
      { content: "Old but retrieved", source: "confirmed", score: 0.8, createdAt: old, lastRetrievedAt: recent, retrievalCount: 5 },
      { content: "Old never retrieved", source: "confirmed", score: 0.8, createdAt: old },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    // The recently retrieved memory should have a higher score
    const retrieved = out.find(m => m.content === "Old but retrieved")!;
    const notRetrieved = out.find(m => m.content === "Old never retrieved")!;
    expect(retrieved.score).toBeGreaterThan(notRetrieved.score);
  });

  it("retrieval count provides diminishing boost", () => {
    const old = new Date(Date.now() - HALF_LIFE);
    const results1: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.8, createdAt: old, retrievalCount: 1 },
    ];
    const results10: MemoryMatch[] = [
      { content: "A", source: "confirmed", score: 0.8, createdAt: old, retrievalCount: 10 },
    ];
    const out1 = applyDecay(results1, { forgettingHalfLifeMs: HALF_LIFE });
    const out10 = applyDecay(results10, { forgettingHalfLifeMs: HALF_LIFE });
    expect(out10[0].score).toBeGreaterThan(out1[0].score);
  });

  it("score never drops below 0.1 * original", () => {
    const veryOld = new Date(Date.now() - HALF_LIFE * 100);
    const results: MemoryMatch[] = [
      { content: "Ancient", source: "confirmed", score: 1.0, createdAt: veryOld },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    // decayFactor floors at 0.1
    expect(out[0].score).toBeCloseTo(0.1, 1);
  });

  it("treats missing dates as brand new (no decay)", () => {
    const results: MemoryMatch[] = [
      { content: "No dates", source: "confirmed", score: 0.9 },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    expect(out[0].score).toBeCloseTo(0.9, 1);
  });

  it("uses default half-life when not specified", () => {
    const old = new Date(Date.now() - 180 * DAY_MS);
    const results: MemoryMatch[] = [
      { content: "Old", source: "confirmed", score: 0.8, createdAt: old },
    ];
    const out = applyDecay(results, {});
    // Should use default 180 day half-life
    expect(out[0].score).toBeCloseTo(0.4, 1); // 0.8 * 0.5
  });

  it("re-sorts results by decayed score", () => {
    const now = Date.now();
    const results: MemoryMatch[] = [
      { content: "High but old", source: "confirmed", score: 0.95, createdAt: new Date(now - HALF_LIFE * 2) },
      { content: "Low but new", source: "confirmed", score: 0.5, createdAt: new Date(now - DAY_MS) },
    ];
    const out = applyDecay(results, { forgettingHalfLifeMs: HALF_LIFE });
    // The newer low-score memory should now outrank the decayed old one
    expect(out[0].content).toBe("Low but new");
  });
});
