/**
 * A finished experiment as one shareable card (`ROADMAP.md` A5).
 *
 * The same four things, in this order, on the image and on the share page: the question, the
 * days it ran, the verdict in words, and the number with its interval. A null result is a
 * result and renders exactly like any other — it is not hidden, and it does not lead with a p.
 *
 * The interval is a **large-sample approximation** for Cohen's d (the exact noncentral-t interval
 * needs a special-function solver that is not worth the weight here). It is labelled as
 * approximate wherever it is shown; when there is no spread to divide by, there is no interval
 * and the card says so instead of inventing bounds.
 */

import { experimentVerdict, type Verdict, type VerdictInput } from '@/lib/verdict';

/** 95% two-sided normal quantile, the approximation's multiplier. */
const Z_95 = 1.96;

export interface ResultCardInput extends VerdictInput {
    /** The question the experiment asked, e.g. "Caffeine → Focus". */
    title: string;
    /** `YYYY-MM-DD`; empty when the row has no usable dates, which must not break a share. */
    startDate: string;
    endDate: string;
}

export interface ResultCard {
    title: string;
    /** "14 days · 4–17 Nov 2026" */
    days: string;
    verdict: Verdict;
    /** Cohen's d, or null when it could not be computed. */
    effectSize: number | null;
    /** Approximate 95% interval around the effect size. */
    interval: { low: number; high: number } | null;
    /** "+0.62 (95% CI +0.11 to +1.13, approximate)", or the reason there is no number. */
    number: string;
}

/**
 * Approximate 95% interval for a standardised mean difference.
 *
 * Var(d) ≈ (n1 + n2) / (n1·n2) + d² / (2(n1 + n2)), the usual delta-method result. It is
 * generous for small arms, which is the right direction to be wrong in.
 */
export function effectInterval(effectSize: number, daysA: number, daysB: number): { low: number; high: number } | null {
    if (!Number.isFinite(effectSize) || daysA < 2 || daysB < 2) return null;
    const variance = (daysA + daysB) / (daysA * daysB) + (effectSize ** 2) / (2 * (daysA + daysB));
    const margin = Z_95 * Math.sqrt(variance);
    if (!Number.isFinite(margin)) return null;
    return { low: effectSize - margin, high: effectSize + margin };
}

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

function formatDays(startDate: string, endDate: string, daysA: number, daysB: number): string {
    const compared = daysA + daysB;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        // A share with unusable dates still shows what was compared; it does not fail.
        return compared > 0 ? `${compared} ${compared === 1 ? 'day' : 'days'} logged` : '';
    }
    const length = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${length} ${length === 1 ? 'day' : 'days'} · ${fmt.format(start)} – ${fmt.format(end)}${compared > 0 ? ` · ${compared} logged` : ''}`;
}

export function resultCard(input: ResultCardInput): ResultCard {
    const verdict = experimentVerdict(input);
    // An effect of zero with no test behind it means "no spread", not "no difference", and it
    // deserves no interval at all (`src/lib/verdict.ts`).
    const noSpread = input.effectSize === 0 && input.pValue == null;
    const interval = input.effectSize != null && !noSpread ? effectInterval(input.effectSize, input.daysA, input.daysB) : null;

    let number: string;
    if (input.effectSize == null) {
        number = 'No effect size to read: the two conditions did not both have enough logged days with variation.';
    } else if (verdict.headline === 'No spread to compare') {
        number = 'Every day looked the same, so there is no spread to put an interval around.';
    } else if (interval) {
        number = `${signed(input.effectSize)} (95% CI ${signed(interval.low)} to ${signed(interval.high)}, approximate)`;
    } else {
        number = signed(input.effectSize);
    }

    return {
        title: input.title,
        days: formatDays(input.startDate, input.endDate, input.daysA, input.daysB),
        verdict,
        effectSize: input.effectSize ?? null,
        interval,
        number,
    };
}

/** The share text, so the button and the page cannot disagree. */
export function shareText(card: ResultCard): string {
    return `${card.title}: ${card.verdict.headline.toLowerCase()}. ${card.number}`;
}
