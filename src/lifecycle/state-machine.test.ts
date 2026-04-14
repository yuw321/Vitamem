import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canTransition,
  transition,
  shouldCool,
  shouldGoDormant,
  reactivate,
  shouldArchive,
  InvalidTransitionError,
} from './state-machine.js';
import { Thread, ThreadState, Memory } from '../types.js';

// ── Helper ──

function makeThread(overrides: Partial<Thread> = {}): Thread {
  const now = new Date();
  return {
    id: 'thread-1',
    userId: 'user-1',
    state: 'active',
    messages: [],
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    coolingStartedAt: null,
    dormantAt: null,
    closedAt: null,
    ...overrides,
  };
}

// ── canTransition ──

describe('canTransition', () => {
  it('allows active → cooling', () => {
    expect(canTransition('active', 'cooling')).toBe(true);
  });

  it('allows cooling → active (reactivation)', () => {
    expect(canTransition('cooling', 'active')).toBe(true);
  });

  it('allows cooling → dormant', () => {
    expect(canTransition('cooling', 'dormant')).toBe(true);
  });

  it('allows dormant → closed', () => {
    expect(canTransition('dormant', 'closed')).toBe(true);
  });

  it('disallows active → dormant (must go through cooling)', () => {
    expect(canTransition('active', 'dormant')).toBe(false);
  });

  it('disallows active → closed', () => {
    expect(canTransition('active', 'closed')).toBe(false);
  });

  it('disallows dormant → active (no reactivation from dormant)', () => {
    expect(canTransition('dormant', 'active')).toBe(false);
  });

  it('disallows dormant → cooling', () => {
    expect(canTransition('dormant', 'cooling')).toBe(false);
  });

  it('disallows any transition from closed', () => {
    const states: ThreadState[] = ['active', 'cooling', 'dormant', 'closed'];
    for (const s of states) {
      expect(canTransition('closed', s)).toBe(false);
    }
  });

  it('disallows self-transitions', () => {
    const states: ThreadState[] = ['active', 'cooling', 'dormant', 'closed'];
    for (const s of states) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

// ── transition ──

describe('transition', () => {
  it('transitions active → cooling and sets coolingStartedAt', () => {
    const thread = makeThread({ state: 'active' });
    const result = transition(thread, 'cooling');

    expect(result.state).toBe('cooling');
    expect(result.coolingStartedAt).toBeInstanceOf(Date);
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(thread.updatedAt.getTime());
  });

  it('transitions cooling → dormant and clears coolingStartedAt', () => {
    const thread = makeThread({
      state: 'cooling',
      coolingStartedAt: new Date(),
    });
    const result = transition(thread, 'dormant');

    expect(result.state).toBe('dormant');
    expect(result.dormantAt).toBeInstanceOf(Date);
    expect(result.coolingStartedAt).toBeNull();
  });

  it('transitions cooling → active (reactivation) and clears coolingStartedAt', () => {
    const thread = makeThread({
      state: 'cooling',
      coolingStartedAt: new Date(),
    });
    const result = transition(thread, 'active');

    expect(result.state).toBe('active');
    expect(result.coolingStartedAt).toBeNull();
  });

  it('transitions dormant → closed and sets closedAt', () => {
    const thread = makeThread({
      state: 'dormant',
      dormantAt: new Date(),
    });
    const result = transition(thread, 'closed');

    expect(result.state).toBe('closed');
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it('throws InvalidTransitionError for invalid transitions', () => {
    const thread = makeThread({ state: 'active' });

    expect(() => transition(thread, 'dormant')).toThrow(InvalidTransitionError);
    expect(() => transition(thread, 'closed')).toThrow(InvalidTransitionError);
  });

  it('throws for transitions from closed state', () => {
    const thread = makeThread({ state: 'closed', closedAt: new Date() });

    expect(() => transition(thread, 'active')).toThrow(InvalidTransitionError);
    expect(() => transition(thread, 'cooling')).toThrow(InvalidTransitionError);
    expect(() => transition(thread, 'dormant')).toThrow(InvalidTransitionError);
  });

  it('does not mutate the original thread', () => {
    const thread = makeThread({ state: 'active' });
    const original = { ...thread };
    transition(thread, 'cooling');

    expect(thread.state).toBe(original.state);
    expect(thread.coolingStartedAt).toBe(original.coolingStartedAt);
  });

  it('InvalidTransitionError has descriptive message', () => {
    const thread = makeThread({ state: 'active' });

    try {
      transition(thread, 'closed');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as Error).message).toContain('active');
      expect((err as Error).message).toContain('closed');
    }
  });
});

// ── shouldCool ──

describe('shouldCool', () => {
  it('returns false for non-active threads', () => {
    const thread = makeThread({ state: 'cooling' });
    expect(shouldCool(thread, 1000)).toBe(false);
  });

  it('returns false when lastMessageAt is null', () => {
    const thread = makeThread({ state: 'active', lastMessageAt: null });
    expect(shouldCool(thread, 1000)).toBe(false);
  });

  it('returns false when not enough time has passed', () => {
    const thread = makeThread({
      state: 'active',
      lastMessageAt: new Date(), // just now
    });
    expect(shouldCool(thread, 60_000)).toBe(false);
  });

  it('returns true when timeout has elapsed', () => {
    const pastTime = new Date(Date.now() - 120_000); // 2 minutes ago
    const thread = makeThread({
      state: 'active',
      lastMessageAt: pastTime,
    });
    expect(shouldCool(thread, 60_000)).toBe(true);
  });

  it('uses the configured timeout, not a hardcoded value', () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const thread = makeThread({
      state: 'active',
      lastMessageAt: oneMinuteAgo,
    });

    // 30 seconds timeout → should cool
    expect(shouldCool(thread, 30_000)).toBe(true);
    // 2 minutes timeout → should not cool
    expect(shouldCool(thread, 120_000)).toBe(false);
  });
});

// ── shouldGoDormant ──

describe('shouldGoDormant', () => {
  it('returns false for non-cooling threads', () => {
    const thread = makeThread({ state: 'active' });
    expect(shouldGoDormant(thread, 1000)).toBe(false);
  });

  it('returns false when coolingStartedAt is null', () => {
    const thread = makeThread({ state: 'cooling', coolingStartedAt: null });
    expect(shouldGoDormant(thread, 1000)).toBe(false);
  });

  it('returns true when dormant timeout has elapsed', () => {
    const pastTime = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 hours ago
    const thread = makeThread({
      state: 'cooling',
      coolingStartedAt: pastTime,
    });
    expect(shouldGoDormant(thread, 6 * 60 * 60 * 1000)).toBe(true);
  });

  it('returns false when dormant timeout has not elapsed', () => {
    const thread = makeThread({
      state: 'cooling',
      coolingStartedAt: new Date(), // just started cooling
    });
    expect(shouldGoDormant(thread, 6 * 60 * 60 * 1000)).toBe(false);
  });
});

// ── reactivate ──

describe('reactivate', () => {
  it('transitions cooling → active', () => {
    const thread = makeThread({
      state: 'cooling',
      coolingStartedAt: new Date(),
    });
    const result = reactivate(thread);

    expect(result.state).toBe('active');
    expect(result.coolingStartedAt).toBeNull();
  });

  it('throws for non-cooling threads', () => {
    expect(() => reactivate(makeThread({ state: 'active' }))).toThrow(InvalidTransitionError);
    expect(() => reactivate(makeThread({ state: 'dormant' }))).toThrow(InvalidTransitionError);
    expect(() => reactivate(makeThread({ state: 'closed' }))).toThrow(InvalidTransitionError);
  });
});

// ── Full lifecycle walk ──

describe('full lifecycle: active → cooling → dormant → closed', () => {
  it('walks through all states in order', () => {
    let thread = makeThread({ state: 'active' });

    thread = transition(thread, 'cooling');
    expect(thread.state).toBe('cooling');
    expect(thread.coolingStartedAt).toBeTruthy();

    thread = transition(thread, 'dormant');
    expect(thread.state).toBe('dormant');
    expect(thread.dormantAt).toBeTruthy();
    expect(thread.coolingStartedAt).toBeNull();

    thread = transition(thread, 'closed');
    expect(thread.state).toBe('closed');
    expect(thread.closedAt).toBeTruthy();
  });

  it('supports reactivation mid-lifecycle: active → cooling → active → cooling → dormant → closed', () => {
    let thread = makeThread({ state: 'active' });

    // First cooling
    thread = transition(thread, 'cooling');
    expect(thread.state).toBe('cooling');

    // Reactivate
    thread = reactivate(thread);
    expect(thread.state).toBe('active');

    // Second cooling
    thread = transition(thread, 'cooling');
    expect(thread.state).toBe('cooling');

    // Now go dormant
    thread = transition(thread, 'dormant');
    expect(thread.state).toBe('dormant');

    // Close
    thread = transition(thread, 'closed');
    expect(thread.state).toBe('closed');
  });
});

// ── shouldArchive ──

describe('shouldArchive', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HALF_LIFE = 180 * DAY_MS;

  function makeMemory(overrides: Partial<Memory> = {}): Memory {
    return {
      id: 'mem-1',
      userId: 'user-1',
      threadId: 'thread-1',
      content: 'test memory',
      source: 'confirmed',
      embedding: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('returns false for pinned memories regardless of age', () => {
    const ancient = makeMemory({
      pinned: true,
      createdAt: new Date(Date.now() - HALF_LIFE * 100),
    });
    expect(shouldArchive(ancient, { forgettingHalfLifeMs: HALF_LIFE })).toBe(false);
  });

  it('returns false for recent memories', () => {
    const recent = makeMemory({ createdAt: new Date() });
    expect(shouldArchive(recent, { forgettingHalfLifeMs: HALF_LIFE })).toBe(false);
  });

  it('returns true for very old unretrieved memories', () => {
    // With default minRetrievalScore of 0.1, decay factor must be < 0.1
    // decayFactor = max(0.1, 1 - t/(2*halfLife))
    // For decayFactor to be < 0.1: need 1 - t/(2*h) < 0.1 => t > 1.8*h
    // But max(0.1, ...) floors at 0.1. So we need minRetrievalScore > 0.1
    const veryOld = makeMemory({
      createdAt: new Date(Date.now() - HALF_LIFE * 10),
    });
    // At minRetrievalScore = 0.2, decay factor of 0.1 < 0.2 => should archive
    expect(shouldArchive(veryOld, {
      forgettingHalfLifeMs: HALF_LIFE,
      minRetrievalScore: 0.2,
    })).toBe(true);
  });

  it('recently retrieved memories resist archiving', () => {
    const mem = makeMemory({
      createdAt: new Date(Date.now() - HALF_LIFE * 10),
      lastRetrievedAt: new Date(Date.now() - DAY_MS),
      retrievalCount: 5,
    });
    expect(shouldArchive(mem, {
      forgettingHalfLifeMs: HALF_LIFE,
      minRetrievalScore: 0.2,
    })).toBe(false);
  });

  it('uses default config values when not specified', () => {
    const recent = makeMemory({ createdAt: new Date() });
    expect(shouldArchive(recent, {})).toBe(false);
  });

  it('high retrieval count prevents archiving', () => {
    const old = makeMemory({
      createdAt: new Date(Date.now() - HALF_LIFE * 5),
      retrievalCount: 100,
    });
    // retrievalBoost = min(0.3, log1p(100)*0.1) = min(0.3, ~0.461) = 0.3
    // decayFactor = max(0.1, 1 - 5h/(2h)) = max(0.1, -1.5) = 0.1
    // with boost: min(1, 0.1 + 0.3) = 0.4, which is > 0.2
    expect(shouldArchive(old, {
      forgettingHalfLifeMs: HALF_LIFE,
      minRetrievalScore: 0.2,
    })).toBe(false);
  });
});
