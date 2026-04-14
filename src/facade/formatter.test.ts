import { describe, it, expect } from "vitest";
import { formatMemoryContextDefault } from "./create-vitamem.js";
import { MemoryMatch, UserProfile, createEmptyProfile } from "../types.js";

function makeMemory(overrides: Partial<MemoryMatch> = {}): MemoryMatch {
  return {
    content: "Test memory",
    source: "confirmed",
    score: 0.9,
    createdAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createEmptyProfile("u_1"), ...overrides };
}

const OPTS = { prioritySignaling: true, chronologicalRetrieval: true, cacheableContext: false };

describe("priority signaling", () => {
  it("marks pinned+confirmed as CRITICAL", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Allergy", pinned: true, source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("[CRITICAL]");
    expect(r).toContain("(confirmed, pinned)");
  });
  it("marks confirmed as IMPORTANT", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Diabetes", source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("[IMPORTANT]");
    expect(r).toContain("(confirmed)");
  });
  it("marks inferred as INFO", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Walks", source: "inferred" })], "q", null, OPTS);
    expect(r).toContain("[INFO]");
    expect(r).toContain("(inferred)");
  });
  it("omits markers when disabled", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "X", pinned: true, source: "confirmed" }), makeMemory({ content: "Y", source: "inferred" })], "q", null, { ...OPTS, prioritySignaling: false });
    expect(r).not.toContain("[CRITICAL]");
    expect(r).not.toContain("[IMPORTANT]");
    expect(r).not.toContain("[INFO]");
    expect(r).toContain("(confirmed, pinned)");
    expect(r).toContain("(inferred)");
  });
});

describe("chronological retrieval", () => {
  it("groups by month/year", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "A", createdAt: new Date("2024-01-15"), source: "confirmed" }), makeMemory({ content: "B", createdAt: new Date("2024-03-10"), source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("--- January 2024 ---");
    expect(r).toContain("--- March 2024 ---");
  });
  it("sorts ascending by createdAt", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Later", createdAt: new Date("2024-03-10"), source: "confirmed" }), makeMemory({ content: "Earlier", createdAt: new Date("2024-01-05"), source: "confirmed" })], "q", null, OPTS);
    expect(r.indexOf("Earlier")).toBeLessThan(r.indexOf("Later"));
  });
  it("includes date mention", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Fact", createdAt: new Date("2024-01-15"), source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("(mentioned 2024-01-15)");
  });
  it("flat list when disabled", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "A", createdAt: new Date("2024-01-15"), source: "confirmed" }), makeMemory({ content: "B", createdAt: new Date("2024-03-10"), source: "confirmed" })], "q", null, { ...OPTS, chronologicalRetrieval: false });
    expect(r).not.toContain("--- January");
    expect(r).not.toContain("(mentioned");
    expect(r).toContain("A");
    expect(r).toContain("B");
  });
  it("handles missing createdAt", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "NoDate", createdAt: undefined, source: "inferred" }), makeMemory({ content: "HasDate", createdAt: new Date("2024-02-01"), source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("--- Unknown ---");
    expect(r).toContain("--- February 2024 ---");
  });
});

describe("cache-friendly context", () => {
  it("includes separator when enabled", () => {
    const p = makeProfile({ conditions: ["Diabetes"] });
    const r = formatMemoryContextDefault([makeMemory({ content: "Pin", pinned: true, source: "confirmed" }), makeMemory({ content: "Ret", source: "confirmed" })], "q", p, { ...OPTS, cacheableContext: true });
    expect(r).toContain("<!-- stable context above, dynamic below -->");
    const sep = r.indexOf("<!-- stable");
    expect(r.indexOf("=== User Profile ===")).toBeLessThan(sep);
    expect(r.indexOf("=== Retrieved Memories ===")).toBeGreaterThan(sep);
  });
  it("no separator when disabled", () => {
    const p = makeProfile({ conditions: ["Diabetes"] });
    const r = formatMemoryContextDefault([makeMemory({ content: "Pin", pinned: true, source: "confirmed" }), makeMemory({ content: "Ret", source: "confirmed" })], "q", p, OPTS);
    expect(r).not.toContain("<!-- stable");
  });
  it("no separator without stable prefix", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "X", source: "inferred" })], "q", null, { ...OPTS, cacheableContext: true });
    expect(r).not.toContain("<!-- stable");
  });
});

describe("profile section", () => {
  it("renders profile", () => {
    const p = makeProfile({ conditions: ["Diabetes"], medications: [{ name: "Metformin", dosage: "500mg" }], allergies: ["Penicillin"], vitals: { a1c: { value: 6.8, unit: "%" } }, goals: ["Lower A1C"] });
    const r = formatMemoryContextDefault([], "q", p, OPTS);
    expect(r).toContain("=== User Profile ===");
    expect(r).toContain("Conditions: Diabetes");
    expect(r).toContain("Medications: Metformin 500mg");
    expect(r).toContain("Allergies: Penicillin");
    expect(r).toContain("Goals: Lower A1C");
  });
  it("omits when null", () => {
    expect(formatMemoryContextDefault([], "q", null, OPTS)).toBe("");
  });
  it("omits when empty", () => {
    expect(formatMemoryContextDefault([], "q", createEmptyProfile("u"), OPTS)).toBe("");
  });
});

describe("critical memories section", () => {
  it("shows pinned", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Pin1", pinned: true, source: "confirmed" }), makeMemory({ content: "Pin2", pinned: true, source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("=== Critical Memories (Always Active) ===");
    expect(r).toContain("Pin1");
    expect(r).toContain("Pin2");
  });
  it("omits when no pinned", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Reg", source: "confirmed" })], "q", null, OPTS);
    expect(r).not.toContain("=== Critical Memories");
  });
});

describe("retrieved memories section", () => {
  it("shows non-pinned", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "Ret", source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("=== Retrieved Memories ===");
  });
  it("omits when only pinned", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "P", pinned: true, source: "confirmed" })], "q", null, OPTS);
    expect(r).not.toContain("=== Retrieved Memories ===");
  });
});

describe("graceful degradation", () => {
  it("empty when no data", () => {
    expect(formatMemoryContextDefault([], "q", null, OPTS)).toBe("");
  });
  it("only profile", () => {
    const r = formatMemoryContextDefault([], "q", makeProfile({ conditions: ["X"] }), OPTS);
    expect(r).toContain("=== User Profile ===");
    expect(r).not.toContain("=== Critical");
    expect(r).not.toContain("=== Retrieved");
  });
  it("only pinned", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "P", pinned: true, source: "confirmed" })], "q", null, OPTS);
    expect(r).toContain("=== Critical");
    expect(r).not.toContain("=== Health Profile");
    expect(r).not.toContain("=== Retrieved");
  });
  it("only retrieved", () => {
    const r = formatMemoryContextDefault([makeMemory({ content: "R", source: "inferred" })], "q", null, OPTS);
    expect(r).toContain("=== Retrieved");
    expect(r).not.toContain("=== Health Profile");
    expect(r).not.toContain("=== Critical");
  });
});

describe("full combined output", () => {
  it("produces correct format", () => {
    const profile = makeProfile({ conditions: ["Type 2 diabetes"], medications: [{ name: "Metformin", dosage: "500mg", frequency: "twice daily" }], allergies: ["Penicillin"], vitals: { A1C: { value: 6.8, unit: "%" } }, goals: ["Reduce A1C below 6.5"] });
    const memories: MemoryMatch[] = [
      makeMemory({ content: "Allergic to penicillin - anaphylaxis", pinned: true, source: "confirmed" }),
      makeMemory({ content: "Taking warfarin", pinned: true, source: "confirmed" }),
      makeMemory({ content: "Has Type 2 diabetes", createdAt: new Date("2024-01-15"), source: "confirmed" }),
      makeMemory({ content: "Started metformin", createdAt: new Date("2024-01-15"), source: "confirmed" }),
      makeMemory({ content: "A1C dropped to 6.8", createdAt: new Date("2024-03-10"), source: "confirmed" }),
      makeMemory({ content: "Switched to morning walks", createdAt: new Date("2024-03-15"), source: "inferred" }),
    ];
    const r = formatMemoryContextDefault(memories, "health", profile, OPTS);
    const pi = r.indexOf("=== User Profile ===");
    const ci = r.indexOf("=== Critical Memories");
    const ri = r.indexOf("=== Retrieved Memories ===");
    expect(pi).toBeGreaterThanOrEqual(0);
    expect(ci).toBeGreaterThan(pi);
    expect(ri).toBeGreaterThan(ci);
    expect(r).toContain("[CRITICAL] Allergic to penicillin");
    expect(r).toContain("[CRITICAL] Taking warfarin");
    expect(r).toContain("--- January 2024 ---");
    expect(r).toContain("--- March 2024 ---");
    expect(r).toContain("[IMPORTANT] Has Type 2 diabetes");
    expect(r).toContain("[INFO] Switched to morning walks");
    expect(r).toContain("(confirmed, pinned)");
    expect(r).toContain("(confirmed)");
    expect(r).toContain("(inferred)");
  });
});
