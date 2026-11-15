/**
 * The three readings of a finished experiment, in plain words.
 *
 * Shared with Advanced Dual N-Back on purpose: the same person sees the same
 * three verdicts in both apps, so a result does not have to be re-learned
 * (`ROADMAP.md` A3, `PRODUCT.md` → Principles).
 *
 * A result screen leads with one of these. Effect size, interval, p and the
 * posterior are the evidence under it, never the headline.
 */

export type VerdictKind = 'clear-change' | 'within-noise' | 'not-enough-data' | 'not-compared';

export interface VerdictInput {
    /**
     * What the engine was able to compare.
     * - `two-arm`: a change and a baseline (the default).
     * - `multi-arm`: more than two conditions, so the run is compared as groups. Never
     *   "not enough data" — the person has plenty, just not this comparison.
     * - `unavailable`: two arms, but the engine produced nothing (fewer than three days in an
     *   arm, or no variation at all). Saying how many days are missing would be honest only if
     *   the days were the reason, so this branch says what it can.
     */
    mode?: 'two-arm' | 'multi-arm' | 'unavailable';
    /** The outcome being measured, e.g. "Focus quality". */
    outcome: string;
    /** The change being tested, e.g. "days with caffeine". */
    change: string;
    /** Logged days in each condition. */
    daysA: number;
    daysB: number;
    /** Standardised difference (Cohen's d). Null when it cannot be computed. */
    effectSize?: number | null;
    /** Two-sided p for the difference, when the engine produced one. */
    pValue?: number | null;
}

export interface Verdict {
    kind: VerdictKind;
    headline: string;
    sentence: string;
}

/** `performN1Stats` refuses to compute below three days in an arm; say so first. */
export const VERDICT_MIN_DAYS_PER_CONDITION = 3;

/** Medium or larger, and unlikely under no difference. */
export const VERDICT_CLEAR_EFFECT = 0.5;

export const VERDICT_ALPHA = 0.05;

export function experimentVerdict(input: VerdictInput): Verdict {
    if (input.mode === 'multi-arm') {
        return {
            kind: 'not-compared',
            headline: 'Not compared as two arms',
            sentence: `This run had more than two conditions, so ${input.outcome} is compared below as groups rather than as a change with a baseline.`,
        };
    }

    if (input.mode === 'unavailable') {
        return {
            kind: 'not-compared',
            headline: 'No comparison to read yet',
            sentence: `This run has no two-arm comparison: each arm needs at least three logged days with some variation in ${input.outcome}.`,
        };
    }

    const shortA = Math.max(0, VERDICT_MIN_DAYS_PER_CONDITION - input.daysA);
    const shortB = Math.max(0, VERDICT_MIN_DAYS_PER_CONDITION - input.daysB);

    if (shortA > 0 || shortB > 0) {
        const parts: string[] = [];
        if (shortA > 0) parts.push(`${shortA} more ${shortA === 1 ? 'day' : 'days'} of the first condition`);
        if (shortB > 0) parts.push(`${shortB} more ${shortB === 1 ? 'day' : 'days'} of the second`);
        return {
            kind: 'not-enough-data',
            headline: 'Not enough data yet',
            sentence: `Keep logging: ${parts.join(' and ')} needed before ${input.outcome} can be compared.`,
        };
    }

    const effect = Math.abs(input.effectSize ?? 0);
    const clear = effect >= VERDICT_CLEAR_EFFECT && input.pValue != null && input.pValue < VERDICT_ALPHA;

    // A perfectly consistent difference has no spread to divide by, so the engine reports an
    // effect of zero with no test behind it. That is the opposite of "no difference": say the
    // run cannot separate it rather than claiming the change did nothing.
    if (effect === 0 && input.pValue == null && input.effectSize != null) {
        return {
            kind: 'within-noise',
            headline: 'No spread to compare',
            sentence: `Every ${input.change} looked the same, so this run cannot say how much of the change in ${input.outcome} is real. Log a few varying days and look again.`,
        };
    }

    if (clear) {
        return {
            kind: 'clear-change',
            headline: 'A clear change',
            sentence: `On the ${input.change}, ${input.outcome} differed by more than chance would explain. A randomized experiment on one person supports a conclusion about you on those days, not about anyone else.`,
        };
    }

    return {
        kind: 'within-noise',
        headline: 'Within noise',
        sentence: `This experiment could not separate the ${input.change} from your normal day-to-day variation in ${input.outcome}. A null result about you is still a result.`,
    };
}
