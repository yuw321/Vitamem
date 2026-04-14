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

  // ── LLM-first classification path ──

  it('LLM-first: fact with profileField:"vitals" routes to structured profile', () => {
    const facts = [{
      content: 'A1C is 6.8%',
      profileField: 'vitals' as const,
      profileKey: 'a1c',
      profileValue: 6.8,
      profileUnit: '%',
    }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('a1c');
    expect(value.record.value).toBeCloseTo(6.8);
    expect(value.record.unit).toBe('%');
  });

  it('LLM-first: fact with profileField:"allergies" routes to structured profile', () => {
    const facts = [{
      content: 'Allergic to latex',
      profileField: 'allergies' as const,
      profileValue: 'latex',
    }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('allergies');
    expect(result.structured[0].action).toBe('add');
    expect(result.structured[0].value).toBe('latex');
  });

  it('LLM-first: fact with profileField:"medications" and string value wraps as object', () => {
    const facts = [{
      content: 'Takes ibuprofen',
      profileField: 'medications' as const,
      profileValue: 'ibuprofen',
    }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.structured[0].field).toBe('medications');
    const med = result.structured[0].value as { name: string };
    expect(med.name).toBe('ibuprofen');
  });

  it('fact without profileField falls through to regex fallback', () => {
    // This fact has no profileField but matches a regex rule
    const facts = [{ content: 'Blood pressure is 130/85' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('vitals');
  });

  // ── Goal disambiguation safety net ──

  it('safety net: reclassifies "doctor wants A1C under 7%" from vitals to goal', () => {
    const facts = [{
      content: 'doctor wants A1C under 7%',
      profileField: 'vitals' as const,
      profileKey: 'a1c',
      profileValue: 7.0,
      profileUnit: '%',
    }];
    const result = classifyStructuredFacts(facts, rules);

    // Should be reclassified to a goal, NOT stored as a vital
    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('goals');
    expect(result.structured[0].action).toBe('add');
    // Value should be the original content string (goal text), not a numeric vital
    expect(typeof result.structured[0].value).toBe('string');
    expect(result.structured[0].value).toContain('doctor wants A1C under 7%');
  });

  it('safety net: actual vital "A1C came back at 7.4%" passes through as vital (no reclassification)', () => {
    const facts = [{
      content: 'A1C came back at 7.4%',
      profileField: 'vitals' as const,
      profileKey: 'a1c',
      profileValue: 7.4,
      profileUnit: '%',
    }];
    const result = classifyStructuredFacts(facts, rules);

    // Should remain a vital — no goal-indicator language present
    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('a1c');
    expect(value.record.value).toBeCloseTo(7.4);
    expect(value.record.unit).toBe('%');
  });

  it('safety net: reclassifies "hoping to get blood pressure below 130" from vitals to goal', () => {
    const facts = [{
      content: 'hoping to get blood pressure below 130',
      profileField: 'vitals' as const,
      profileKey: 'blood_pressure',
      profileValue: 130,
      profileUnit: 'mmHg',
    }];
    const result = classifyStructuredFacts(facts, rules);

    // Should be reclassified to a goal
    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('goals');
    expect(result.structured[0].action).toBe('add');
    expect(typeof result.structured[0].value).toBe('string');
  });

  // ── Regex-path goal guard & one-vital-per-key constraint ──

  it('regex path: reclassifies vital with goal language to goal (no profileField)', () => {
    // No profileField → falls through to regex. Content matches A1C regex as "vitals",
    // but "Goal to lower" triggers goal-indicator guard via reclassifyVitalGoal.
    const facts = [{ content: 'Goal to lower A1C below 7.0%', tags: ['vital'] }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('goals');
    expect(result.structured[0].action).toBe('add');
    expect(typeof result.structured[0].value).toBe('string');
    expect(result.structured[0].sourceText).toBe('Goal to lower A1C below 7.0%');
  });

  it('one-vital-per-key: second duplicate A1C vital is reclassified as goal', () => {
    // Two facts that both regex-classify to vitals with key "a1c".
    // Neither contains goal language, so the guard doesn't fire.
    // The one-per-key post-pass should keep the first and reclassify the second.
    const facts = [
      { content: 'Latest A1C is 7.4%' },
      { content: 'A1C is 7.0%' },
    ];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(2);
    // First: kept as vital
    expect(result.structured[0].field).toBe('vitals');
    const v = result.structured[0].value as { key: string; record: { value: number } };
    expect(v.key).toBe('a1c');
    expect(v.record.value).toBeCloseTo(7.4);
    // Second: reclassified to goal
    expect(result.structured[1].field).toBe('goals');
    expect(result.structured[1].action).toBe('add');
    expect(typeof result.structured[1].value).toBe('string');
  });

  it('single regex-classified A1C vital passes through unchanged', () => {
    // A single vital with no duplicates and no goal language — should remain as vitals.
    const facts = [{ content: 'A1C came back at 7.4%' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(1);
    expect(result.freeform).toHaveLength(0);
    expect(result.structured[0].field).toBe('vitals');
    expect(result.structured[0].action).toBe('set');
    const value = result.structured[0].value as { key: string; record: { value: number; unit: string } };
    expect(value.key).toBe('a1c');
    expect(value.record.value).toBeCloseTo(7.4);
    expect(value.record.unit).toBe('%');
  });

  it('fact with neither LLM classification nor regex match goes to freeform', () => {
    const facts = [{ content: 'Prefers morning appointments' }];
    const result = classifyStructuredFacts(facts, rules);

    expect(result.structured).toHaveLength(0);
    expect(result.freeform).toHaveLength(1);
    expect(result.freeform[0].content).toBe('Prefers morning appointments');
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
