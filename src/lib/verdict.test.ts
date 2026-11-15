import { describe, expect, it } from 'vitest';
import { VERDICT_MIN_DAYS_PER_CONDITION, experimentVerdict } from './verdict';
import { performN1Stats } from '@/stats/analysis';

const base = { outcome: 'Focus quality', change: 'days with caffeine' };

describe('experiment verdict', () => {
    it('reads a large, unlikely difference as a clear change', () => {
        const verdict = experimentVerdict({ ...base, daysA: 7, daysB: 7, effectSize: 1.2, pValue: 0.004 });
        expect(verdict.kind).toBe('clear-change');
        expect(verdict.headline).toBe('A clear change');
        expect(verdict.sentence).toMatch(/supports a conclusion about you/);
    });

    it('reads a small difference as within noise, null results included', () => {
        const verdict = experimentVerdict({ ...base, daysA: 7, daysB: 7, effectSize: 0.1, pValue: 0.62 });
        expect(verdict.kind).toBe('within-noise');
        expect(verdict.headline).toBe('Within noise');
        expect(verdict.sentence).toMatch(/could not separate/);
    });

    it('will not call a medium effect clear without the test behind it', () => {
        expect(experimentVerdict({ ...base, daysA: 7, daysB: 7, effectSize: 0.7, pValue: 0.18 }).kind).toBe('within-noise');
        expect(experimentVerdict({ ...base, daysA: 7, daysB: 7, effectSize: 0.7 }).kind).toBe('within-noise');
    });

    it('says how much is missing before it says anything about the difference', () => {
        const verdict = experimentVerdict({ ...base, daysA: 1, daysB: 0, effectSize: 2, pValue: 0.001 });
        expect(verdict.kind).toBe('not-enough-data');
        expect(verdict.headline).toBe('Not enough data yet');
        expect(verdict.sentence).toContain(`2 more days of the first condition`);
        expect(verdict.sentence).toContain(`3 more days of the second`);
        expect(verdict.sentence).not.toMatch(/p =|chance would explain/);
    });

    it('reads the engine end to end, not a p value handed to it', () => {
        // The p-value function this depends on returned 0 for t = 1, df = 10, so two genuinely
        // null arms came out as "A clear change" and a large effect came out as "within noise".
        const nullArms = performN1Stats([5, 6, 7, 6, 5, 6, 7], [5, 6, 6, 5, 6, 5, 6]);
        expect(nullArms).not.toBeNull();
        expect(nullArms!.tTest!.pValue).toBeGreaterThan(0.05);
        expect(
            experimentVerdict({
                ...base,
                daysA: nullArms!.nA,
                daysB: nullArms!.nB,
                effectSize: nullArms!.effectSize,
                pValue: nullArms!.tTest!.pValue,
            }).kind,
        ).not.toBe('clear-change');

        const bigEffect = performN1Stats([1, 2, 1, 2, 1, 2], [9, 10, 9, 10, 9, 10]);
        expect(bigEffect).not.toBeNull();
        expect(bigEffect!.tTest!.pValue).toBeLessThan(0.001);
        expect(
            experimentVerdict({
                ...base,
                daysA: bigEffect!.nA,
                daysB: bigEffect!.nB,
                effectSize: bigEffect!.effectSize,
                pValue: bigEffect!.tTest!.pValue,
            }).kind,
        ).toBe('clear-change');
    });

    it('agrees with the engine about the minimum, checked against the engine itself', () => {
        // The old assertion compared a constant to a literal, so it could not fail when the
        // engine's own minimum changed. Ask the engine instead.
        expect(performN1Stats([1, 2], [3, 4, 5])).toBeNull();
        expect(performN1Stats([1, 2, 3], [4, 5, 6])).not.toBeNull();
        expect(VERDICT_MIN_DAYS_PER_CONDITION).toBe(2 + 1);

        const atTheLine = experimentVerdict({ ...base, daysA: 3, daysB: 3, effectSize: 0.9, pValue: 0.01 });
        expect(atTheLine.kind).toBe('clear-change');
    });

    it('does not read a run it did not compare as "not enough data"', () => {
        // More than two conditions leave n1 null; the person has data, not a missing baseline.
        const verdict = experimentVerdict({ ...base, daysA: 0, daysB: 0, effectSize: null, pValue: null, mode: 'multi-arm' });
        expect(verdict.kind).toBe('not-compared');
        expect(verdict.sentence).toMatch(/more than two conditions/);
        expect(verdict.sentence).not.toMatch(/Keep logging/);

        const unavailable = experimentVerdict({ ...base, daysA: 4, daysB: 4, effectSize: null, pValue: null, mode: 'unavailable' });
        expect(unavailable.kind).toBe('not-compared');
        expect(unavailable.sentence).toMatch(/no two-arm comparison/);
        expect(unavailable.sentence).not.toMatch(/Keep logging|more than two conditions/);
    });

    it('does not call a perfectly consistent difference "no difference"', () => {
        // Two arms with no spread at all: the engine returns nothing it can compute, because
        // there is no variance to divide by. That is not a null result.
        expect(performN1Stats([5, 5, 5], [8, 8, 8])).toBeNull();
        const unavailable = experimentVerdict({ ...base, daysA: 3, daysB: 3, effectSize: null, pValue: null, mode: 'unavailable' });
        expect(unavailable.sentence).not.toMatch(/made no difference/);

        // And if a caller does hand over a zero effect with no test, it is still not "no effect".
        const zero = experimentVerdict({ ...base, daysA: 5, daysB: 5, effectSize: 0, pValue: null });
        expect(zero.headline).toBe('No spread to compare');
    });
});
