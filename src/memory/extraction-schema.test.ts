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

  it('preserves profileField, profileKey, profileValue, profileUnit', () => {
    const input = {
      memories: [
        {
          content: 'A1C is 6.8%',
          source: 'confirmed',
          profileField: 'vitals',
          profileKey: 'a1c',
          profileValue: 6.8,
          profileUnit: '%',
        },
      ],
    };
    const result = validateExtraction(input);
    expect(result).toHaveLength(1);
    expect(result[0].profileField).toBe('vitals');
    expect(result[0].profileKey).toBe('a1c');
    expect(result[0].profileValue).toBe(6.8);
    expect(result[0].profileUnit).toBe('%');
  });

  it('ignores invalid profileField values', () => {
    const input = {
      memories: [
        {
          content: 'Some fact',
          source: 'confirmed',
          profileField: 'invalid_field',
        },
      ],
    };
    const result = validateExtraction(input);
    expect(result).toHaveLength(1);
    expect(result[0].profileField).toBeUndefined();
  });

  it('preserves profile fields for medications with object value', () => {
    const input = {
      memories: [
        {
          content: 'Takes metformin 1000mg',
          source: 'confirmed',
          profileField: 'medications',
          profileValue: { name: 'metformin', dosage: '1000mg' },
        },
      ],
    };
    const result = validateExtraction(input);
    expect(result).toHaveLength(1);
    expect(result[0].profileField).toBe('medications');
    expect(result[0].profileValue).toEqual({ name: 'metformin', dosage: '1000mg' });
  });
});
