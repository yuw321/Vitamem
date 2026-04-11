import { describe, it, expect } from 'vitest';
import { validateExtraction } from './extraction-schema.js';

describe('validateExtraction', () => {
  it('returns array with 1 entry for valid wrapper object', () => {
    const input = { memories: [{ content: 'Has diabetes', source: 'confirmed' }] };
    const result = validateExtraction(input);
    expect(result).toEqual([{ content: 'Has diabetes', source: 'confirmed' }]);
  });

  it('preserves tags in valid wrapper', () => {
    const input = {
      memories: [{ content: 'Takes metformin', source: 'confirmed', tags: ['medication'] }],
    };
    const result = validateExtraction(input);
    expect(result).toEqual([
      { content: 'Takes metformin', source: 'confirmed', tags: ['medication'] },
    ]);
  });

  it('returns array with 1 entry for valid bare array (backward compat)', () => {
    const input = [{ content: 'Has diabetes', source: 'confirmed' }];
    const result = validateExtraction(input);
    expect(result).toEqual([{ content: 'Has diabetes', source: 'confirmed' }]);
  });

  it('returns empty array for empty memories', () => {
    const input = { memories: [] };
    const result = validateExtraction(input);
    expect(result).toEqual([]);
  });

  it('filters out entry missing content', () => {
    const input = { memories: [{ source: 'confirmed' }] };
    const result = validateExtraction(input);
    expect(result).toEqual([]);
  });

  it('filters out entry missing source', () => {
    const input = { memories: [{ content: 'test' }] };
    const result = validateExtraction(input);
    expect(result).toEqual([]);
  });

  it('filters out entry with invalid source value', () => {
    const input = { memories: [{ content: 'test', source: 'maybe' }] };
    const result = validateExtraction(input);
    expect(result).toEqual([]);
  });

  it('returns only valid entries from mixed valid and invalid', () => {
    const input = {
      memories: [
        { content: 'valid', source: 'confirmed' },
        { content: '', source: 'confirmed' },
        { source: 'inferred' },
      ],
    };
    const result = validateExtraction(input);
    expect(result).toEqual([{ content: 'valid', source: 'confirmed' }]);
  });

  it('returns empty array for non-object input', () => {
    const result = validateExtraction('hello');
    expect(result).toEqual([]);
  });

  it('returns empty array for null input', () => {
    const result = validateExtraction(null);
    expect(result).toEqual([]);
  });

  it('filters invalid tags keeping only strings', () => {
    const input = {
      memories: [{ content: 'test', source: 'confirmed', tags: ['valid', 123, null] }],
    };
    const result = validateExtraction(input);
    expect(result).toHaveLength(1);
    expect(result[0].tags).toEqual(['valid']);
  });
});
