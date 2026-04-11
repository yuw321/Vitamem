import type { StructuredExtractionRule, StructuredFact } from "../types.js";

interface ExtractedFactLike {
  content: string;
  source?: string;
  tags?: string[];
}

interface ClassificationResult<T extends ExtractedFactLike> {
  /** Facts that matched a structured extraction rule */
  structured: StructuredFact[];
  /** Facts that didn't match any rule — continue to embedding pipeline */
  freeform: T[];
}

/**
 * Classify extracted facts into structured (profile-bound) and freeform (embedding-bound).
 * Structured facts are identified by regex pattern matching against the extraction rules.
 * A fact can only match ONE rule (first match wins).
 */
export function classifyStructuredFacts<T extends ExtractedFactLike>(
  facts: T[],
  rules: StructuredExtractionRule[],
): ClassificationResult<T> {
  const structured: StructuredFact[] = [];
  const freeform: T[] = [];

  for (const fact of facts) {
    let matched = false;
    for (const rule of rules) {
      const match = fact.content.match(rule.pattern);
      if (match) {
        const { value, action } = rule.extractor(fact.content, match);
        structured.push({
          field: rule.profileField,
          value,
          action,
          sourceText: fact.content,
        });
        matched = true;
        break; // first match wins
      }
    }
    if (!matched) {
      freeform.push(fact);
    }
  }

  return { structured, freeform };
}

/**
 * Apply structured facts to a user's profile via the storage adapter.
 */
export async function applyStructuredFacts(
  userId: string,
  facts: StructuredFact[],
  storage: { updateProfileField?(userId: string, field: string, value: unknown, action: "set" | "add" | "remove"): Promise<void> },
): Promise<number> {
  if (!storage.updateProfileField || facts.length === 0) return 0;

  let updated = 0;
  for (const fact of facts) {
    try {
      await storage.updateProfileField(userId, fact.field, fact.value, fact.action);
      updated++;
    } catch (err) {
      console.warn(`[vitamem:profile] Failed to update ${fact.field}:`, err);
    }
  }
  return updated;
}
