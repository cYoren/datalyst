import { describe, expect, it } from 'vitest';
import { incompleteBeta, lnGamma, tTestPValue } from './pvalue';

/**
 * Published two-tailed t-table values. The implementation these replace returned 0 for
 * t = 1, df = 10 and 1 for t = 2.228, df = 10, so these numbers are the point of the file.
 */
const T_TABLE: [t: number, df: number, p: number][] = [
    [1.0, 10, 0.3409],
    [2.228, 10, 0.05],
    [2.776, 4, 0.05],
    [3.169, 10, 0.01],
    [4.604, 4, 0.01],
    [12.706, 1, 0.05],
    [2.0, 30, 0.0546],
    [1.96, 1000, 0.0503],
];

describe('tTestPValue', () => {
    it.each(T_TABLE)('t = %s, df = %s gives p ≈ %s', (t, df, expected) => {
        expect(tTestPValue(t, df)).toBeCloseTo(expected, 3);
    });

    it('is two-tailed and symmetric in the sign of t', () => {
        for (const [t, df] of [[1.5, 8], [3.2, 21], [0.4, 3]] as const) {
            expect(tTestPValue(-t, df)).toBeCloseTo(tTestPValue(t, df), 10);
        }
    });

    it('returns 1 for t = 0 and stays inside (0, 1]', () => {
        expect(tTestPValue(0, 10)).toBe(1);
        for (const t of [0.1, 1, 2, 5, 50]) {
            const p = tTestPValue(t, 7);
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it('falls as |t| grows, and across the 0.05 boundary where a t-table says it should', () => {
        const ps = [0.5, 1, 1.5, 2, 3, 6].map((t) => tTestPValue(t, 10));
        for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThan(ps[i - 1]);
        expect(tTestPValue(2.2, 10)).toBeGreaterThan(0.05);
        expect(tTestPValue(2.23, 10)).toBeLessThan(0.05);
    });

    it('never returns a value outside (0, 1) for absurd input', () => {
        for (const [t, df] of [[0, 0], [Number.NaN, 5], [1e6, 3], [1, -2], [Infinity, 4]] as const) {
            const p = tTestPValue(t, df);
            expect(Number.isFinite(p)).toBe(true);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });
});

describe('the incomplete beta it stands on', () => {
    it('matches either side of the symmetry boundary', () => {
        // I_x(a, b) = 1 - I_{1-x}(b, a)
        for (const [x, a, b] of [[0.3, 2, 3], [0.8, 5, 2], [0.5, 0.5, 5]] as const) {
            expect(incompleteBeta(x, a, b)).toBeCloseTo(1 - incompleteBeta(1 - x, b, a), 10);
        }
    });

    it('matches a numerical integral, on the case that used to return 2.6e25', () => {
        // Simpson's rule over the beta density, computed here rather than in the code under test.
        const a = 5;
        const b = 0.5;
        const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
        const pdf = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t) - lnBeta));
        const steps = 20000;
        const h = 0.5 / steps;
        let sum = 0;
        for (let i = 0; i <= steps; i++) sum += (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2) * pdf(i * h);
        expect(incompleteBeta(0.5, a, b)).toBeCloseTo((sum * h) / 3, 6);
    });

    it('is a gamma function, not a guess', () => {
        expect(Math.exp(lnGamma(5))).toBeCloseTo(24, 6); // 4!
        expect(Math.exp(lnGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 6);
    });
});
