/**
 * Every scoring, mastery and scheduling threshold in the system.
 *
 * These previously lived scattered across eight files with values that
 * disagreed — "strong" meant 70 in five places and 90 in two, "weak" was
 * variously 40, 50 or 60, and two independent revision schedules gave different
 * answers for the same concept. Import from here instead of hardcoding.
 */

/** Mastery bands. A concept's mastery is always 0–100. */
export const MASTERY = {
  /** At or above this, we treat the concept as demonstrably known. */
  STRONG: 70,
  /** Below this, the concept needs work. */
  WEAK: 40,
  /** At or above this, stop nagging the learner about it. */
  MASTERED: 90,
} as const;

/** Fraction of an assessment's points needed to pass a gated step. */
export const PASS_RATIO = 0.6;

/**
 * How much each kind of evidence counts toward mastery.
 *
 * Weights are relative "sample sizes": a project contributes far more signal
 * than merely having a documentation page open. Passive exposure is
 * deliberately tiny so that reading about something can never look like
 * knowing it — that was the old touchNode bug.
 */
export const EVIDENCE_WEIGHT = {
  project: 3.0,
  assessment: 2.0,
  path_verification: 2.0,
  context_quiz: 1.0,
  challenge: 0.75,
  interval_check: 0.5,
  exposure: 0.05,
} as const;

export type EvidenceKind = keyof typeof EVIDENCE_WEIGHT;

/**
 * Difficulty multiplies the weight: succeeding on a hard question is stronger
 * evidence than succeeding on an easy one.
 */
export const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  beginner: 0.8,
  intermediate: 1.0,
  advanced: 1.3,
  contextual: 0.9,
};

export const DEFAULT_DIFFICULTY_MULTIPLIER = 1.0;

/**
 * Controls how quickly confidence approaches 100 as evidence accumulates:
 * confidence = 100 * (1 - exp(-totalMass / CONFIDENCE_SCALE)).
 * At totalMass = 4 (≈2 assessments) confidence is ~63%; at 12 it is ~95%.
 */
export const CONFIDENCE_SCALE = 4;

/**
 * Older evidence should not outweigh recent evidence forever. Before adding new
 * evidence we shrink the existing masses by this much per day since the last
 * update, so the model tracks current ability with a half-life of ~35 days.
 */
export const EVIDENCE_HALF_LIFE_DAYS = 35;

/** Recorded mastery never drops below this once a concept has been seen. */
export const MIN_MASTERY = 0;

/** Confidence floor, so a stale concept still reads as "we have seen this". */
export const MIN_CONFIDENCE = 5;

/**
 * Forgetting curve. Retention after `elapsed` days without review is
 * exp(-elapsed / stability), where stability grows as the learner succeeds.
 * The displayed `mastery` column is masteryRaw * retention.
 */
export const RETENTION = {
  /** Stability in days for a brand-new concept. */
  INITIAL_STABILITY_DAYS: 3,
  /** Never let stability fall below this. */
  MIN_STABILITY_DAYS: 1,
  /** Cap so a concept still resurfaces eventually. */
  MAX_STABILITY_DAYS: 365,
  /** Retention floor — we never claim a learned concept decayed to nothing. */
  FLOOR: 0.35,
} as const;

/** SM-2 style scheduling parameters. */
export const SCHEDULE = {
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,
  MAX_EASE: 3.0,
  /** First interval after a successful first review, in days. */
  FIRST_INTERVAL_DAYS: 1,
  /** Second interval after two successes, in days. */
  SECOND_INTERVAL_DAYS: 3,
  MAX_INTERVAL_DAYS: 365,
  /** A failed review collapses the interval to this. */
  LAPSE_INTERVAL_DAYS: 1,
} as const;

/** Points assigned per question when a generator does not specify one. */
export const DEFAULT_QUESTION_POINTS = 20;

/** Question types we can grade without asking a model. */
export const OBJECTIVE_QUESTION_TYPES = ['mcq', 'multiple_choice', 'true_false', 'boolean'];

/** Clamp helper used throughout scoring. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp to the 0–100 range used by mastery, confidence and weakness. */
export function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}
