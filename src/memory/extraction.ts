import { Message, Memory, MemorySource, LLMAdapter } from '../types.js';

export interface ExtractedFact {
  content: string;
  source: MemorySource;
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
        facts.push({ content: sentence, source });
      }
    }
  }

  return facts;
}
