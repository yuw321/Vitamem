import { describe, it, expect, beforeEach } from 'vitest';
import { EphemeralAdapter } from './ephemeral-adapter.js';

// ── Profile Storage (EphemeralAdapter) ──

describe('EphemeralAdapter — Profile Storage', () => {
  let adapter: EphemeralAdapter;

  beforeEach(() => {
    adapter = new EphemeralAdapter();
  });

  it('getProfile returns null for new user', async () => {
    const profile = await adapter.getProfile('user-new');
    expect(profile).toBeNull();
  });

  it('updateProfile creates profile with conditions', async () => {
    await adapter.updateProfile('user-1', { conditions: ['Type 2 diabetes'] });
    const profile = await adapter.getProfile('user-1');

    expect(profile).not.toBeNull();
    expect(profile!.userId).toBe('user-1');
    expect(profile!.conditions).toEqual(['Type 2 diabetes']);
  });

  it('updateProfile merges — conditions then allergies', async () => {
    await adapter.updateProfile('user-1', { conditions: ['hypertension'] });
    await adapter.updateProfile('user-1', { allergies: ['penicillin'] });

    const profile = await adapter.getProfile('user-1');
    expect(profile!.conditions).toEqual(['hypertension']);
    expect(profile!.allergies).toEqual(['penicillin']);
  });

  it('updateProfileField set — sets vitals.a1c with correct shape', async () => {
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');

    const profile = await adapter.getProfile('user-1');
    expect(profile).not.toBeNull();
    expect(profile!.vitals.a1c).toBeDefined();
    expect(profile!.vitals.a1c.value).toBeCloseTo(6.8);
    expect(profile!.vitals.a1c.unit).toBe('%');
    expect(profile!.vitals.a1c.recordedAt).toBeInstanceOf(Date);
  });

  it('updateProfileField set — vitals tracks previousValue on update', async () => {
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 7.2, unit: '%' } }, 'set');
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.vitals.a1c.value).toBeCloseTo(6.8);
    expect(profile!.vitals.a1c.previousValue).toBeCloseTo(7.2);
  });

  it('updateProfileField add to array — add allergy', async () => {
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.allergies).toContain('penicillin');
  });

  it('updateProfileField add deduplicates strings', async () => {
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'add');
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.allergies).toEqual(['penicillin']);
  });

  it('updateProfileField add medication deduplicates by name', async () => {
    await adapter.updateProfileField('user-1', 'medications', { name: 'metformin', dosage: '500mg' }, 'add');
    await adapter.updateProfileField('user-1', 'medications', { name: 'metformin', dosage: '1000mg' }, 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.medications).toHaveLength(1);
    expect(profile!.medications[0].name).toBe('metformin');
    expect(profile!.medications[0].dosage).toBe('1000mg');
  });

  // ── Goal semantic deduplication ──

  it('goal dedup — same metric replaces (A1C below 7 → Maintain A1C below 7)', async () => {
    await adapter.updateProfileField('user-1', 'goals', 'Lower A1C below 7.0%', 'add');
    await adapter.updateProfileField('user-1', 'goals', 'Maintain A1C below 7.0%', 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.goals).toHaveLength(1);
    expect(profile!.goals[0]).toBe('Maintain A1C below 7.0%');
  });

  it('goal dedup — different metrics kept separate', async () => {
    await adapter.updateProfileField('user-1', 'goals', 'Lower A1C below 7.0%', 'add');
    await adapter.updateProfileField('user-1', 'goals', 'Exercise 3 times per week', 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.goals).toHaveLength(2);
    expect(profile!.goals).toContain('Lower A1C below 7.0%');
    expect(profile!.goals).toContain('Exercise 3 times per week');
  });

  it('goal dedup — exact duplicate added twice results in one goal', async () => {
    await adapter.updateProfileField('user-1', 'goals', 'Lower A1C below 7.0%', 'add');
    await adapter.updateProfileField('user-1', 'goals', 'Lower A1C below 7.0%', 'add');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.goals).toHaveLength(1);
    expect(profile!.goals[0]).toBe('Lower A1C below 7.0%');
  });

  it('updateProfileField set — vitals same value skips update preserving previousValue', async () => {
    // Step 1: Set A1C to 7.4%
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 7.4, unit: '%' } }, 'set');
    // Step 2: Update A1C to 6.8% — previousValue should be 7.4
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');

    let profile = await adapter.getProfile('user-1');
    expect(profile!.vitals.a1c.value).toBeCloseTo(6.8);
    expect(profile!.vitals.a1c.previousValue).toBeCloseTo(7.4);

    // Step 3: Set A1C to 6.8% again (same value) — should be a no-op
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');

    profile = await adapter.getProfile('user-1');
    expect(profile!.vitals.a1c.value).toBeCloseTo(6.8);
    // previousValue must STILL be 7.4, not overwritten to 6.8
    expect(profile!.vitals.a1c.previousValue).toBeCloseTo(7.4);
  });

  it('updateProfileField remove from array', async () => {
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'add');
    await adapter.updateProfileField('user-1', 'allergies', 'sulfa', 'add');
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'remove');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.allergies).toEqual(['sulfa']);
  });
});
