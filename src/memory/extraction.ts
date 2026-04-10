import { Message, Memory, MemorySource, LLMAdapter } from '../types.js';

export interface ExtractedFact {
  content: string;
  source: MemorySource;
  tags?: string[];
}

/**
 * Extract memories from a thread's messages using an LLM.
 * - User messages produce "confirmed" facts.
 * - Assistant messages produce "inferred" facts.
 */
export async function extractMemories(
  messages: Message[],
  llm: LLMAdapter,
): Promise<ExtractedFact[]> {
  if (messages.length === 0) return [];

  const extracted = await llm.extractMemories(messages);

  // Validate and normalize
  return extracted
    .filter((f) => f.content && f.content.trim().length > 0)
    .map((f) => ({
      content: f.content.trim(),
      source: f.source === 'confirmed' || f.source === 'inferred' ? f.source : 'inferred',
      tags: classifyTags(f.content),
    }));
}

/**
 * Classify which source a fact should get based on the originating message role.
 */
export function classifySource(role: Message['role']): MemorySource {
  return role === 'user' ? 'confirmed' : 'inferred';
}

/**
 * Simple rule-based fact extraction fallback (no LLM).
 * Extracts sentences that look like factual statements.
 */
export function extractFactsSimple(messages: Message[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const source = classifySource(msg.role);
    // Split into sentences, keep those that look like facts
    const sentences = msg.content
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const sentence of sentences) {
      // Heuristic: facts often contain "I", "my", "prefer", "work", "use", etc.
      const factPatterns = /\b(I|my|prefer|work|use|like|am|have|need|want)\b/i;
      if (factPatterns.test(sentence)) {
        facts.push({ content: sentence, source, tags: classifyTags(sentence) });
      }
    }
  }

  return facts;
}

/** Known tag categories for memory classification. */
export const MEMORY_TAGS = [
  'medication',
  'condition',
  'lifestyle',
  'preference',
  'social',
  'general',
] as const;

export type MemoryTag = (typeof MEMORY_TAGS)[number];

/**
 * Simple rule-based tag classifier for extracted facts.
 * Assigns tags based on keyword matching.
 */
export function classifyTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];

  const medicationPatterns = /\b(medication|medicine|drug|prescription|dose|dosage|pill|tablet|mg|aspirin|metformin|insulin|antibiotic|supplement|vitamin)\b/i;
  const conditionPatterns = /\b(diabetes|hypertension|asthma|allergy|allergic|diagnosis|condition|disease|disorder|syndrome|symptom|pain|chronic|cancer|anxiety|depression|blood pressure)\b/i;
  const lifestylePatterns = /\b(exercise|workout|diet|sleep|walk|run|gym|yoga|meditation|smoke|smoking|alcohol|drink|weight|calorie|vegan|vegetarian)\b/i;
  const preferencePatterns = /\b(prefer|like|dislike|favorite|want|enjoy|love|hate|rather|choose)\b/i;
  const socialPatterns = /\b(family|friend|wife|husband|partner|child|children|parent|mother|father|sibling|brother|sister|colleague|doctor|therapist)\b/i;

  if (medicationPatterns.test(lower)) tags.push('medication');
  if (conditionPatterns.test(lower)) tags.push('condition');
  if (lifestylePatterns.test(lower)) tags.push('lifestyle');
  if (preferencePatterns.test(lower)) tags.push('preference');
  if (socialPatterns.test(lower)) tags.push('social');

  if (tags.length === 0) tags.push('general');
  return tags;
}
