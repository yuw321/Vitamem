import { Thread, ThreadState, VALID_TRANSITIONS } from '../types.js';

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
