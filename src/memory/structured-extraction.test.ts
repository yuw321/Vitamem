import { describe, it, expect, vi } from 'vitest';
import { classifyStructuredFacts, applyStructuredFacts } from './structured-extraction.js';
import { HEALTH_STRUCTURED_RULES, StructuredExtractionRule } from '../types.js';

// ── classifyStructuredFacts ──

describe('classifyStructuredFacts', () => {
  const rules = HEALTH_STRUCTURED_RULES;

  it('classifies A1C fact as structured', () => {
    const facts = [{ content: 'A1C level is 6.8%' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    expect(result.structured[0].sourceText).toBe('A1C level is 6.8%');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('a1c');
    expect(value.record.value).toBeCloseTo(6.8);
    expect(value.record.unit).toBe('%');
  });

  it('classifies allergy as structured', () => {
    const facts = [{ content: 'Allergic to penicillin' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('allergies');
    expect(result.structured[0].action).toBe('add');
    expect(result.structured[0].value).toBe('penicillin');
  });

  it('classifies medication as structured', () => {
    const facts = [{ content: 'Takes metformin 1000mg twice daily' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('medications');
    expect(result.structured[0].action).toBe('add');
    const med = result.structured[0].value as { name: string; dosage: string };
    expect(med.name).toBe('metformin');
    expect(med.dosage).toContain('1000mg');
  });

  it('classifies condition as structured', () => {
    const facts = [{ content: 'Diagnosed with Type 2 diabetes' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('conditions');
    expect(result.structured[0].action).toBe('add');
  });

  it('passes freeform fact through', () => {
    const facts = [{ content: 'Exercises Monday Wednesday Friday' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(0);
    expect(result.freeform).toHaveLength(1);
    expect(result.freeform[0].content).toBe('Exercises Monday Wednesday Friday');
  });

  it('splits mixed facts correctly', () => {
    const facts = [
      { content: 'A1C level is 7.2%' },
      { content: 'Exercises Monday Wednesday Friday' },
      { content: 'Allergic to sulfa drugs' },
    ];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(2);
    expect(result.freeform).toHaveLength(1);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[1].field).toBe('allergies');
    expect(result.freeform[0].content).toBe('Exercises Monday Wednesday Friday');
  });

  it('returns empty arrays for empty input', () => {
    const result = classifyStructuredFacts([], rules);

    expect(result.structured).toEqual([]);
    expect(result.freeform).toEqual([]);
  });

  it('classifies blood pressure as structured vital', () => {
    const facts = [{ content: 'Blood pressure is 120/80' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('blood_pressure');
  });

  it('classifies weight as structured vital', () => {
    const facts = [{ content: 'Weighs 180 lbs' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('weight');
    expect(value.record.value).toBe(180);
  });

  it('classifies goal as structured', () => {
    const facts = [{ content: 'Goal is to lose 10 pounds by summer' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.structured[0].field).toBe('goals');
    expect(result.structured[0].action).toBe('add');
  });
});

// ── applyStructuredFacts ──

describe('applyStructuredFacts', () => {
  it('applies facts to storage via updateProfileField', async () => {
    const updateProfileField = vi.fn().mockResolvedValue(undefined);
    const storage = { updateProfileField };

    const facts = [
      { field: 'vitals' as const, value: { key: 'a1c', record: { value: 6.8, unit: '%' } }, action: 'set' as const, sourceText: 'A1C is 6.8%' },
      { field: 'allergies' as const, value: 'penicillin', action: 'add' as const, sourceText: 'Allergic to penicillin' },
      { field: 'conditions' as const, value: 'Type 2 diabetes', action: 'add' as const, sourceText: 'Has Type 2 diabetes' },
    ];

    const count = await applyStructuredFacts('user-1', facts, storage);

    expect(count).toBe(3);
    expect(updateProfileField).toHaveBeenCalledTimes(3);
    expect(updateProfileField).toHaveBeenCalledWith('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');
    expect(updateProfileField).toHaveBeenCalledWith('user-1', 'allergies', 'penicillin', 'add');
    expect(updateProfileField).toHaveBeenCalledWith('user-1', 'conditions', 'Type 2 diabetes', 'add');
  });

  it('returns count of updated fields', async () => {
    const updateProfileField = vi.fn().mockResolvedValue(undefined);
    const storage = { updateProfileField };

    const facts = [
      { field: 'allergies' as const, value: 'penicillin', action: 'add' as const, sourceText: 'Allergic to penicillin' },
      { field: 'allergies' as const, value: 'sulfa', action: 'add' as const, sourceText: 'Allergic to sulfa' },
      { field: 'vitals' as const, value: { key: 'a1c', record: { value: 7.0, unit: '%' } }, action: 'set' as const, sourceText: 'A1C is 7.0' },
    ];

    const count = await applyStructuredFacts('user-1', facts, storage);
    expect(count).toBe(3);
  });

  it('returns 0 when storage does not support profiles', async () => {
    const storage = {}; // no updateProfileField

    const facts = [
      { field: 'allergies' as const, value: 'penicillin', action: 'add' as const, sourceText: 'Allergic to penicillin' },
    ];

    const count = await applyStructuredFacts('user-1', facts, storage);
    expect(count).toBe(0);
  });

  it('handles errors gracefully and continues with remaining facts', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const updateProfileField = vi.fn()
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const storage = { updateProfileField };

    const facts = [
      { field: 'vitals' as const, value: { key: 'a1c', record: { value: 6.8, unit: '%' } }, action: 'set' as const, sourceText: 'A1C 6.8%' },
      { field: 'allergies' as const, value: 'penicillin', action: 'add' as const, sourceText: 'Allergic to penicillin' },
      { field: 'conditions' as const, value: 'diabetes', action: 'add' as const, sourceText: 'Has diabetes' },
    ];

    const count = await applyStructuredFacts('user-1', facts, storage);

    // First call failed, but second and third succeeded
    expect(count).toBe(2);
    expect(updateProfileField).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });
});
