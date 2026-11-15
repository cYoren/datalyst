/**
 * The one place the correlation engine's bar lives.
 *
 * `StatsService` computes with these, and the dashboard explains readiness with
 * them, so "6 more days together" is the same rule that decides when a pattern
 * appears. Change a number here and both move together (`ROADMAP.md` W3).
 */

/** Paired days two variables need before the engine will look at them. */
export const MIN_PAIRED_DAYS = 14;

/** Below this, a coefficient is not worth showing even when significant. */
export const MIN_ABS_COEFFICIENT = 0.3;

/** Family-wise error rate, divided by the number of pairs tested (Bonferroni). */
export const SIGNIFICANCE_ALPHA = 0.05;
