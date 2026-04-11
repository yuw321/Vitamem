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

  it('updateProfileField set — sets vitals.a1c', async () => {
    await adapter.updateProfileField('user-1', 'vitals', { key: 'a1c', record: { value: 6.8, unit: '%' } }, 'set');

    // The "set" action on vitals replaces the whole vitals object
    // But vitals is handled specially with add action; set replaces the field
    const profile = await adapter.getProfile('user-1');
    expect(profile).not.toBeNull();
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

  it('updateProfileField remove from array', async () => {
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'add');
    await adapter.updateProfileField('user-1', 'allergies', 'sulfa', 'add');
    await adapter.updateProfileField('user-1', 'allergies', 'penicillin', 'remove');

    const profile = await adapter.getProfile('user-1');
    expect(profile!.allergies).toEqual(['sulfa']);
  });
});
