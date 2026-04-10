import { describe, it, expect } from "vitest";
import { applyRecencyWeighting, applyMMR } from "./reranking.js";
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
