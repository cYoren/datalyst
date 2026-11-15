import { describe, expect, it } from 'vitest';
import { effectInterval, resultCard, shareText } from './result-card';

/**
 * `ROADMAP.md` A5: a finished experiment renders as one card with the question, the days, the
 * verdict and the number with its interval — and a null result is a result.
 */

const base = {
    title: 'Caffeine → Focus',
    startDate: '2026-11-04',
    endDate: '2026-11-17',
    outcome: 'Focus',
    change: 'days with caffeine',
};

describe('the interval', () => {
    it('brackets the effect and widens as the arms shrink', () => {
        const wide = effectInterval(0.6, 3, 3)!;
        const narrow = effectInterval(0.6, 30, 30)!;

        expect(wide.low).toBeLessThan(0.6);
        expect(wide.high).toBeGreaterThan(0.6);
        expect(narrow.high - narrow.low).toBeLessThan(wide.high - wide.low);
    });

    it('produces no interval when an arm is too small to estimate one', () => {
        expect(effectInterval(0.6, 1, 20)).toBeNull();
        expect(effectInterval(Number.NaN, 10, 10)).toBeNull();
    });

    it('is symmetric around the effect', () => {
        const interval = effectInterval(-0.4, 12, 11)!;
        expect((interval.low + interval.high) / 2).toBeCloseTo(-0.4, 10);
    });
});

describe('the result card', () => {
    it('leads with a plain verdict and shows the number with its interval underneath', () => {
        const card = resultCard({ ...base, daysA: 8, daysB: 7, effectSize: 0.9, pValue: 0.01 });

        expect(card.verdict.kind).toBe('clear-change');
        expect(card.number).toMatch(/^\+0\.90 \(95% CI \+?[\d.-]+ to \+?[\d.-]+, approximate\)$/);
        expect(card.days).toContain('14 days');
        expect(card.days).toContain('15 logged');
        // The headline is the verdict, never the p value.
        expect(card.verdict.headline).not.toMatch(/p\s*=/);
    });

    it('renders a null result as a result, not as a failure', () => {
        const card = resultCard({ ...base, daysA: 10, daysB: 10, effectSize: 0.05, pValue: 0.88 });

        expect(card.verdict.kind).toBe('within-noise');
        expect(card.number).toContain('95% CI');
        expect(shareText(card)).toContain('within noise');
        expect(shareText(card)).not.toMatch(/failed|no result|invalid/i);
    });

    it('says an unfinished experiment needs more days instead of showing a difference', () => {
        const card = resultCard({ ...base, daysA: 2, daysB: 9, effectSize: 0.4, pValue: 0.2 });

        expect(card.verdict.kind).toBe('not-enough-data');
        expect(card.verdict.sentence).toMatch(/1 more day/);
    });

    it('refuses to invent an interval when every day looked the same', () => {
        const card = resultCard({ ...base, daysA: 6, daysB: 6, effectSize: 0, pValue: null });

        expect(card.verdict.headline).toBe('No spread to compare');
        expect(card.interval).toBeNull();
        expect(card.number).toMatch(/no spread/i);
        expect(card.number).not.toMatch(/\d/);
    });

    it('says why there is no effect size rather than printing a dash', () => {
        const card = resultCard({ ...base, daysA: 0, daysB: 0, effectSize: null });

        expect(card.effectSize).toBeNull();
        expect(card.number).toMatch(/did not both have enough logged days/);
    });

    it('keeps a multi-arm run out of a two-arm comparison', () => {
        const card = resultCard({ ...base, mode: 'multi-arm', daysA: 6, daysB: 6, effectSize: null });
        expect(card.verdict.kind).toBe('not-compared');
    });
});
