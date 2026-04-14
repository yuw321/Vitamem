import { ReflectionResult } from '../types.js';
import { ExtractedFact } from './extraction.js';

const DEFAULT_REFLECTION_PROMPT = `You are a memory-extraction quality reviewer. You will receive:
1. A list of facts that were extracted from a conversation.
2. A list of existing memories already stored for this user.
3. The original conversation messages.

Your job is to evaluate the extracted facts for:
- **Accuracy**: Are the facts faithful to what was actually said in the conversation?
- **Contradictions**: Do any new facts conflict with existing memories? If so, decide which to keep.
- **Completeness**: Was any important information from the conversation missed?
- **Specificity**: Are any facts too vague to be useful? Can they be enriched with context from the conversation?

Respond with a JSON object matching this exact structure (no markdown, no explanation, just JSON):
{
  "correctedFacts": [
    {
      "content": "the fact text (corrected/enriched if needed)",
      "source": "confirmed" | "inferred",
      "action": "keep" | "enrich" | "remove",
      "reason": "optional explanation for changes",
      "tags": ["optional", "tags"],
      "profileField": "optional profile field name",
      "profileKey": "optional profile key",
      "profileValue": "optional profile value",
      "profileUnit": "optional unit"
    }
  ],
  "missedFacts": [
    {
      "content": "fact that was missed during extraction",
      "source": "confirmed" | "inferred",
      "tags": ["optional", "tags"]
    }
  ],
  "conflicts": [
    {
      "newFact": "the new fact that conflicts",
      "existingMemory": "the existing memory it conflicts with",
      "resolution": "keep_new" | "keep_existing" | "merge"
    }
  ]
}

Rules:
- For "correctedFacts", include ALL original facts with action "keep" if they are correct, "enrich" if you improved them, or "remove" if they are wrong/useless.
- Only add to "missedFacts" if the conversation clearly contains important information that was not extracted.
- Only add to "conflicts" if a new fact directly contradicts an existing memory.
- Always output valid JSON. No trailing commas. No comments.`;

/**
 * Reflect on extracted facts using a second LLM call.
 * Validates accuracy, detects conflicts with existing memories,
 * catches missed facts, and enriches vague facts.
 *
 * If reflection fails (e.g. invalid JSON from LLM), returns the
 * original facts unchanged so the pipeline is never broken.
 */
export async function reflectOnExtraction(
  extractedFacts: ExtractedFact[],
  existingMemories: Array<{ content: string; source: string }>,
  originalMessages: Array<{ role: string; content: string }>,
  llm: { chat: (messages: Array<{ role: string; content: string }>) => Promise<string> },
  customPrompt?: string,
): Promise<ReflectionResult> {
  const systemPrompt = customPrompt ?? DEFAULT_REFLECTION_PROMPT;

  const userPayload = JSON.stringify({
    extractedFacts: extractedFacts.map(f => ({
      content: f.content,
      source: f.source,
      tags: f.tags,
      ...(f.profileField !== undefined && { profileField: f.profileField }),
      ...(f.profileKey !== undefined && { profileKey: f.profileKey }),
      ...(f.profileValue !== undefined && { profileValue: f.profileValue }),
      ...(f.profileUnit !== undefined && { profileUnit: f.profileUnit }),
    })),
    existingMemories: existingMemories.map(m => ({
      content: m.content,
      source: m.source,
    })),
    conversation: originalMessages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  }, null, 2);

  try {
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPayload },
    ]);

    const parsed = parseReflectionResponse(response);
    return parsed;
  } catch (error) {
    console.warn('[vitamem:reflection] Reflection failed, returning original facts:', error);
    return fallbackResult(extractedFacts);
  }
}

/**
 * Parse the LLM response into a ReflectionResult.
 * Handles potential markdown code fences around the JSON.
 */
function parseReflectionResponse(response: string): ReflectionResult {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(cleaned);

  // Validate structure
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Reflection response is not a valid object');
  }

  const result: ReflectionResult = {
    correctedFacts: [],
    missedFacts: [],
    conflicts: [],
  };

  if (Array.isArray(parsed.correctedFacts)) {
    result.correctedFacts = parsed.correctedFacts
      .filter((f: any) => f && typeof f.content === 'string' && f.content.trim().length > 0)
      .map((f: any) => ({
        content: f.content.trim(),
        source: f.source === 'confirmed' ? 'confirmed' : 'inferred',
        action: ['keep', 'enrich', 'remove'].includes(f.action) ? f.action : 'keep',
        ...(f.reason && { reason: f.reason }),
        ...(f.tags && { tags: f.tags }),
        ...(f.profileField && { profileField: f.profileField }),
        ...(f.profileKey && { profileKey: f.profileKey }),
        ...(f.profileValue !== undefined && { profileValue: f.profileValue }),
        ...(f.profileUnit && { profileUnit: f.profileUnit }),
      }));
  }

  if (Array.isArray(parsed.missedFacts)) {
    result.missedFacts = parsed.missedFacts
      .filter((f: any) => f && typeof f.content === 'string' && f.content.trim().length > 0)
      .map((f: any) => ({
        content: f.content.trim(),
        source: f.source === 'confirmed' ? 'confirmed' : 'inferred',
        ...(f.tags && { tags: f.tags }),
        ...(f.profileField && { profileField: f.profileField }),
        ...(f.profileKey && { profileKey: f.profileKey }),
        ...(f.profileValue !== undefined && { profileValue: f.profileValue }),
        ...(f.profileUnit && { profileUnit: f.profileUnit }),
      }));
  }

  if (Array.isArray(parsed.conflicts)) {
    result.conflicts = parsed.conflicts
      .filter((c: any) => c && typeof c.newFact === 'string' && typeof c.existingMemory === 'string')
      .map((c: any) => ({
        newFact: c.newFact,
        existingMemory: c.existingMemory,
        resolution: ['keep_new', 'keep_existing', 'merge'].includes(c.resolution) ? c.resolution : 'keep_new',
      }));
  }

  return result;
}

/**
 * Build a fallback ReflectionResult that passes through all original facts unchanged.
 */
function fallbackResult(extractedFacts: ExtractedFact[]): ReflectionResult {
  return {
    correctedFacts: extractedFacts.map(f => ({
      content: f.content,
      source: f.source,
      action: 'keep' as const,
      ...(f.tags && { tags: f.tags }),
      ...(f.profileField && { profileField: f.profileField }),
      ...(f.profileKey && { profileKey: f.profileKey }),
      ...(f.profileValue !== undefined && { profileValue: String(f.profileValue) }),
      ...(f.profileUnit && { profileUnit: f.profileUnit }),
    })),
    missedFacts: [],
    conflicts: [],
  };
}

/**
 * Convert a ReflectionResult into a flat array of ExtractedFacts for the pipeline.
 * Filters out facts with action "remove" and merges in missed facts.
 */
export function applyReflectionResult(result: ReflectionResult): ExtractedFact[] {
  const kept = result.correctedFacts
    .filter(f => f.action !== 'remove')
    .map(f => ({
      content: f.content,
      source: f.source,
      ...(f.tags && { tags: f.tags }),
      ...(f.profileField && { profileField: f.profileField as any }),
      ...(f.profileKey && { profileKey: f.profileKey }),
      ...(f.profileValue !== undefined && { profileValue: f.profileValue }),
      ...(f.profileUnit && { profileUnit: f.profileUnit }),
    }));

  const missed = result.missedFacts.map(f => ({
    content: f.content,
    source: f.source,
    ...(f.tags && { tags: f.tags }),
    ...(f.profileField && { profileField: f.profileField as any }),
    ...(f.profileKey && { profileKey: f.profileKey }),
    ...(f.profileValue !== undefined && { profileValue: f.profileValue }),
    ...(f.profileUnit && { profileUnit: f.profileUnit }),
  }));

  return [...kept, ...missed];
}
