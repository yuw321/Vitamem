import type { MemorySource } from '../types.js';

/**
 * Validated extraction result returned by `validateExtraction()`.
 */
export interface ValidatedMemory {
  content: string;
  source: MemorySource;
  tags?: string[];
  profileField?: 'conditions' | 'medications' | 'allergies' | 'vitals' | 'goals' | 'none';
  profileKey?: string;
  profileValue?: string | number | { name: string; dosage?: string; frequency?: string };
  profileUnit?: string;
}

/**
 * Validate and normalize the parsed JSON from an LLM extraction response.
 *
 * Handles both formats:
 * - Bare array: `[{ content, source, tags? }]`
 * - Wrapper object: `{ "memories": [{ content, source, tags? }] }`
 *
 * Invalid entries are silently dropped so a single malformed item
 * never crashes the whole extraction pipeline.
 */
export function validateExtraction(parsed: unknown): ValidatedMemory[] {
  let items: unknown[];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'memories' in parsed &&
    Array.isArray((parsed as any).memories)
  ) {
    items = (parsed as any).memories;
  } else {
    return [];
  }

  return items
    .filter(
      (item): item is { content: string; source: MemorySource; tags?: string[] } => {
        if (!item || typeof item !== 'object') return false;
        const obj = item as Record<string, unknown>;
        if (typeof obj.content !== 'string' || !obj.content.trim()) return false;
        if (obj.source !== 'confirmed' && obj.source !== 'inferred') return false;
        return true;
      },
    )
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const result: ValidatedMemory = {
        content: item.content,
        source: item.source,
        ...(Array.isArray(item.tags)
          ? { tags: item.tags.filter((t): t is string => typeof t === 'string') }
          : {}),
      };
      // Pass through LLM-provided profile classification fields
      if (typeof obj.profileField === 'string' &&
          ['conditions', 'medications', 'allergies', 'vitals', 'goals', 'none'].includes(obj.profileField)) {
        result.profileField = obj.profileField as ValidatedMemory['profileField'];
      }
      if (typeof obj.profileKey === 'string') {
        result.profileKey = obj.profileKey;
      }
      if (obj.profileValue !== undefined && obj.profileValue !== null) {
        result.profileValue = obj.profileValue as ValidatedMemory['profileValue'];
      }
      if (typeof obj.profileUnit === 'string') {
        result.profileUnit = obj.profileUnit;
      }
      return result;
    });
}
