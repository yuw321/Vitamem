import { Thread, ThreadState, Memory, VALID_TRANSITIONS } from '../types.js';

/** Default half-life: 180 days in milliseconds */
const DEFAULT_HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;

export class InvalidTransitionError extends Error {
  constructor(from: ThreadState, to: ThreadState) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Returns true if transitioning from `from` to `to` is allowed.
 */
export function canTransition(from: ThreadState, to: ThreadState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Transition a thread to a new state, returning a new Thread object.
 * Throws InvalidTransitionError if the transition is not allowed.
 */
export function transition(thread: Thread, to: ThreadState): Thread {
  if (!canTransition(thread.state, to)) {
    throw new InvalidTransitionError(thread.state, to);
  }

  const now = new Date();
  const updated: Thread = {
    ...thread,
    state: to,
    updatedAt: now,
  };

  switch (to) {
    case 'cooling':
      updated.coolingStartedAt = now;
      break;
    case 'dormant':
      updated.dormantAt = now;
      updated.coolingStartedAt = null;
      break;
    case 'closed':
      updated.closedAt = now;
      break;
    case 'active':
      updated.coolingStartedAt = null;
      break;
  }

  return updated;
}

/**
 * Determine if a thread should transition to cooling based on inactivity.
 */
export function shouldCool(thread: Thread, coolingTimeoutMs: number): boolean {
  if (thread.state !== 'active') return false;
  if (!thread.lastMessageAt) return false;
  return Date.now() - thread.lastMessageAt.getTime() >= coolingTimeoutMs;
}

/**
 * Determine if a cooling thread should transition to dormant.
 * Default: 6 hours from cooling start.
 */
export function shouldGoDormant(thread: Thread, dormantTimeoutMs: number): boolean {
  if (thread.state !== 'cooling') return false;
  if (!thread.coolingStartedAt) return false;
  return Date.now() - thread.coolingStartedAt.getTime() >= dormantTimeoutMs;
}

/**
 * Reactivate a cooling thread (e.g., when a new message arrives).
 */
export function reactivate(thread: Thread): Thread {
  if (thread.state !== 'cooling') {
    throw new InvalidTransitionError(thread.state, 'active');
  }
  return transition(thread, 'active');
}

/**
 * Determine if a memory should be archived based on its decay score.
 * Returns true if the memory's decay score falls below the minRetrievalScore
 * threshold and the memory is not pinned.
 *
 * @param memory - The memory to evaluate
 * @param config - Configuration with minRetrievalScore and forgettingHalfLifeMs
 * @returns true if the memory should be archived
 */
export function shouldArchive(
  memory: Memory,
  config: { minRetrievalScore?: number; forgettingHalfLifeMs?: number },
): boolean {
  // Pinned memories are never archived
  if (memory.pinned) return false;

  const minScore = config.minRetrievalScore ?? 0.1;
  const halfLife = config.forgettingHalfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const now = Date.now();

  // Determine the reference time: lastRetrievedAt if available, otherwise createdAt
  const referenceTime = memory.lastRetrievedAt
    ? memory.lastRetrievedAt.getTime()
    : memory.createdAt.getTime();

  const timeSinceLastRetrieval = now - referenceTime;

  // Base decay factor
  let decayFactor = Math.max(
    0.1,
    1 - timeSinceLastRetrieval / (2 * halfLife),
  );

  // Retrieval count bonus
  const retrievalCount = memory.retrievalCount ?? 0;
  if (retrievalCount > 0) {
    const retrievalBoost = Math.min(0.3, Math.log1p(retrievalCount) * 0.1);
    decayFactor = Math.min(1, decayFactor + retrievalBoost);
  }

  return decayFactor < minScore;
}
