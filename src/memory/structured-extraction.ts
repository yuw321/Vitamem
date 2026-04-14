import type { MemorySource, StructuredExtractionRule, StructuredFact } from "../types.js";

interface ExtractedFactLike {
  content: string;
  source?: MemorySource;
  tags?: string[];
  profileField?: 'conditions' | 'medications' | 'allergies' | 'vitals' | 'goals' | 'none';
  profileKey?: string;
  profileValue?: string | number | { name: string; dosage?: string; frequency?: string };
  profileUnit?: string;
}

interface ClassificationResult<T extends ExtractedFactLike> {
  /** Facts that matched a structured extraction rule */
  structured: StructuredFact[];
  /** Facts that didn't match any rule — continue to embedding pipeline */
  freeform: T[];
}

/**
 * Classify extracted facts into structured (profile-bound) and freeform (embedding-bound).
 *
 * Uses an LLM-first approach: if a fact already has `profileField` set by the LLM during
 * extraction, the structured fact is constructed directly from the LLM's classification.
 * For facts without LLM classification, regex-based rules serve as a fallback safety net.
 * A fact can only match ONE rule (first match wins).
 */
export function classifyStructuredFacts<T extends ExtractedFactLike>(
  facts: T[],
  rules: StructuredExtractionRule[],
): ClassificationResult<T> {
  const structured: StructuredFact[] = [];
  const freeform: T[] = [];

  for (const fact of facts) {
    // Safety net: reclassify vitals → goals when the content contains strong
    // goal-indicator language. This catches cases where the LLM misclassifies
    // an aspirational statement (e.g. "wants to get BP under 130") as a vital.
    if (fact.profileField === 'vitals' && containsGoalIndicator(fact.content)) {
      fact.profileField = 'goals';
      fact.profileValue = fact.content;
      fact.profileKey = undefined;
      fact.profileUnit = undefined;
    }

    // LLM-first: if profileField is "none", the LLM explicitly decided this is
    // a general fact — route directly to freeform, skipping regex fallback.
    if (fact.profileField === 'none') {
      freeform.push(fact);
      continue;
    }

    // LLM-first: use profile classification from the LLM if present
    if (fact.profileField) {
      const sf = buildStructuredFactFromLLM(fact);
      if (sf) {
        structured.push(reclassifyVitalGoal(sf));
        continue;
      }
    }

    // Regex fallback: try rules for facts without LLM classification
    let matched = false;
    for (const rule of rules) {
      const match = fact.content.match(rule.pattern);
      if (match) {
        const { value, action } = rule.extractor(fact.content, match);
        const sf: StructuredFact = {
          field: rule.profileField,
          value,
          action,
          sourceText: fact.content,
        };
        structured.push(reclassifyVitalGoal(sf));
        matched = true;
        break; // first match wins
      }
    }

    // Freeform: no LLM classification and no regex match
    if (!matched) {
      freeform.push(fact);
    }
  }

  // Post-classification pass: one-vital-per-key constraint.
  // If multiple StructuredFacts have field === 'vitals' with the same key,
  // keep only the first occurrence and reclassify the rest as goals.
  const seenVitalKeys = new Set<string>();
  for (let i = 0; i < structured.length; i++) {
    const sf = structured[i];
    if (sf.field === 'vitals' && typeof sf.value === 'object' && sf.value !== null && 'key' in sf.value) {
      const key = (sf.value as { key: string }).key;
      if (seenVitalKeys.has(key)) {
        structured[i] = { field: 'goals', value: sf.sourceText, action: 'add', sourceText: sf.sourceText };
      } else {
        seenVitalKeys.add(key);
      }
    }
  }

  return { structured, freeform };
}

/**
 * Build a StructuredFact from LLM-provided profile classification fields.
 */
function buildStructuredFactFromLLM(fact: ExtractedFactLike): StructuredFact | null {
  const { profileField, profileKey, profileValue, profileUnit } = fact;
  if (!profileField) return null;

  switch (profileField) {
    case 'vitals': {
      // Vitals require a key and numeric value
      const numVal = typeof profileValue === 'number' ? profileValue : parseFloat(String(profileValue));
      if (!profileKey || isNaN(numVal)) return null;
      return {
        field: 'vitals',
        value: { key: profileKey, record: { value: numVal, unit: profileUnit || '' } },
        action: 'set',
        sourceText: fact.content,
      };
    }
    case 'medications': {
      // Medications expect an object with at least a name
      if (typeof profileValue === 'object' && profileValue !== null && 'name' in profileValue) {
        return {
          field: 'medications',
          value: profileValue,
          action: 'add',
          sourceText: fact.content,
        };
      }
      // If LLM gave a plain string, wrap it
      if (typeof profileValue === 'string') {
        return {
          field: 'medications',
          value: { name: profileValue },
          action: 'add',
          sourceText: fact.content,
        };
      }
      return null;
    }
    case 'conditions':
    case 'allergies':
    case 'goals': {
      // Simple string values added to arrays
      const strVal = typeof profileValue === 'string' ? profileValue : String(profileValue);
      return {
        field: profileField,
        value: strVal,
        action: 'add',
        sourceText: fact.content,
      };
    }
    default:
      return null;
  }
}

/**
 * Check whether a fact's content contains strong goal-indicator language.
 * This is a narrow keyword check used only as a safety net for vitals → goals
 * reclassification — not a general-purpose classifier.
 */
const GOAL_KEYWORDS_RE = /\b(?:goal|target|aim|wants?|hoping|trying\s+to)\b/i;
const ASPIRATION_CONTEXT_RE = /\b(?:wants?|get(?:ting)?|aim|hoping|trying\s+to|goal|target)\b.{0,20}\b(?:under|below|less\s+than)\b|\b(?:under|below|less\s+than)\b.{0,20}\b(?:goal|target|aim)\b/i;

function containsGoalIndicator(content: string): boolean {
  return GOAL_KEYWORDS_RE.test(content) || ASPIRATION_CONTEXT_RE.test(content);
}

/**
 * If a StructuredFact is classified as 'vitals' but its sourceText contains
 * goal-indicator language, reclassify it as a goal. Returns the original
 * fact unchanged for non-vitals.
 */
function reclassifyVitalGoal(sf: StructuredFact): StructuredFact {
  if (sf.field === 'vitals' && containsGoalIndicator(sf.sourceText)) {
    return { field: 'goals', value: sf.sourceText, action: 'add', sourceText: sf.sourceText };
  }
  return sf;
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
