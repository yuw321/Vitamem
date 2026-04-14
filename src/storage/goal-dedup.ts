/**
 * Semantic goal deduplication utilities.
 *
 * When a new goal references the same health metric as an existing goal,
 * the existing one is replaced (newer wording is more current).
 * Falls back to word-overlap similarity for non-metric goals.
 */

/** Health-metric keywords and their canonical forms. */
const METRIC_ALIASES: Record<string, string> = {
  a1c: "a1c",
  hba1c: "a1c",
  "blood pressure": "blood_pressure",
  bp: "blood_pressure",
  weight: "weight",
  glucose: "glucose",
  "blood sugar": "glucose",
  cholesterol: "cholesterol",
  ldl: "cholesterol",
  hdl: "cholesterol",
  bmi: "bmi",
  "body mass index": "bmi",
};

/**
 * Lowercase, strip punctuation (keep spaces & digits), collapse whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return the canonical metric name found in `text`, or `null`.
 * Longer alias keys are tested first so "blood pressure" matches before "bp".
 */
function extractMetric(text: string): string | null {
  const norm = normalize(text);
  // Sort aliases longest-first to prefer multi-word matches
  const sortedKeys = Object.keys(METRIC_ALIASES).sort(
    (a, b) => b.length - a.length,
  );
  for (const alias of sortedKeys) {
    if (norm.includes(alias)) {
      return METRIC_ALIASES[alias];
    }
  }
  return null;
}

/**
 * Compute word-level Jaccard-style overlap ratio between two strings.
 * Returns a value in [0, 1].
 */
function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalize(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the index of an existing goal that is semantically similar to `newGoal`.
 *
 * Returns the index into `existingGoals`, or `-1` if the new goal is unique.
 *
 * Rules:
 * 1. If both goals reference the same health metric → duplicate (replace).
 * 2. If one is a normalized substring of the other → duplicate (replace).
 * 3. If word overlap > 80 % → duplicate (replace).
 * 4. Otherwise → new goal.
 */
export function findSimilarGoal(
  existingGoals: string[],
  newGoal: string,
): number {
  const newMetric = extractMetric(newGoal);
  const newNorm = normalize(newGoal);

  for (let i = 0; i < existingGoals.length; i++) {
    const existing = existingGoals[i];

    // 1. Same metric keyword
    if (newMetric !== null) {
      const existingMetric = extractMetric(existing);
      if (existingMetric === newMetric) return i;
    }

    // 2. Substring check on normalised strings
    const existingNorm = normalize(existing);
    if (
      existingNorm.includes(newNorm) ||
      newNorm.includes(existingNorm)
    ) {
      return i;
    }

    // 3. Word overlap > 80 %
    if (wordOverlap(newGoal, existing) > 0.8) {
      return i;
    }
  }

  return -1;
}

/**
 * Add or replace a goal in the array using semantic deduplication.
 * Mutates `goals` in place and returns it for convenience.
 */
export function addGoalWithDedup(goals: string[], newGoal: string): string[] {
  const idx = findSimilarGoal(goals, newGoal);
  if (idx >= 0) {
    // Replace the existing similar goal with the newer wording
    goals[idx] = newGoal;
  } else {
    goals.push(newGoal);
  }
  return goals;
}
