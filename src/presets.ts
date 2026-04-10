export const PRESETS = {
  'daily-checkin': {
    coolingTimeoutMs: 2 * 60 * 60 * 1000,       // 2 hours
    dormantTimeoutMs: 30 * 60 * 1000,            // 30 minutes
    closedTimeoutMs: 7 * 24 * 60 * 60 * 1000,    // 7 days
  },
  'weekly-therapy': {
    coolingTimeoutMs: 24 * 60 * 60 * 1000,       // 24 hours
    dormantTimeoutMs: 6 * 60 * 60 * 1000,        // 6 hours
    closedTimeoutMs: 90 * 24 * 60 * 60 * 1000,   // 90 days
  },
  'on-demand': {
    coolingTimeoutMs: 30 * 60 * 1000,             // 30 minutes
    dormantTimeoutMs: 15 * 60 * 1000,             // 15 minutes
    closedTimeoutMs: 30 * 24 * 60 * 60 * 1000,    // 30 days
  },
  'long-term': {
    coolingTimeoutMs: 12 * 60 * 60 * 1000,       // 12 hours
    dormantTimeoutMs: 6 * 60 * 60 * 1000,        // 6 hours
    closedTimeoutMs: 365 * 24 * 60 * 60 * 1000,  // 365 days
  },
} as const;

export type PresetName = keyof typeof PRESETS;
