import { MIN_PAIRED_DAYS } from '@/stats/thresholds';

/**
 * How close a pair of variables is to becoming a pattern.
 *
 * The old dashboard counted one global "0 / 14 days" bar, which was wrong twice
 * over: the engine needs 14 days of the *same two variables*, not 14 days of
 * anything, and a promise tied to a date the data may not support is a promise
 * the product breaks (`ROADMAP.md` W3, `PRODUCT.md`).
 */

export interface PairDays {
    /** Human label for the first variable, e.g. "Sleep (Hours)". */
    first: string;
    /** Human label for the second variable. */
    second: string;
    /** Days on which both were logged. */
    daysTogether: number;
}

export interface PairReadiness extends PairDays {
    /** Days still missing, never negative. */
    daysNeeded: number;
    /** True when the engine has enough paired days to look at the pair. */
    ready: boolean;
}

export function readinessFor(pairs: PairDays[], minDays: number = MIN_PAIRED_DAYS): PairReadiness[] {
    return pairs.map((pair) => {
        const daysNeeded = Math.max(0, minDays - pair.daysTogether);
        return { ...pair, daysNeeded, ready: daysNeeded === 0 };
    });
}

/**
 * The pairs worth naming on the dashboard, answering a different question from
 * "which two will pay off soonest".
 *
 * A ready pair is *not* dropped: a person with 30 paired days and no pattern yet would then be
 * told they have logged nothing, which is the same lie W3 exists to remove, inverted. Ready pairs
 * come last — they have nothing left to wait for — and are shown only when nothing is still
 * counting, so the line reads "enough days together, no pattern yet" instead of pretending the
 * check-ins are missing.
 */
export function dashboardPairs(pairs: PairDays[], limit = 2, minDays: number = MIN_PAIRED_DAYS): PairReadiness[] {
    const counted = readinessFor(pairs, minDays).filter((pair) => pair.daysTogether > 0);
    const waiting = counted.filter((pair) => !pair.ready).sort((a, b) => b.daysTogether - a.daysTogether);
    if (waiting.length > 0) return waiting.slice(0, limit);
    return counted.filter((pair) => pair.ready).sort((a, b) => b.daysTogether - a.daysTogether).slice(0, limit);
}

/** "Sleep (Hours) and Headache (Pain): 6 more days together." */
export function readinessSentence(pair: PairReadiness): string {
    if (pair.ready) {
        return `${pair.first} and ${pair.second}: enough days together, and no clear pattern yet.`;
    }
    const day = pair.daysNeeded === 1 ? 'day' : 'days';
    return `${pair.first} and ${pair.second}: ${pair.daysNeeded} more ${day} together.`;
}
