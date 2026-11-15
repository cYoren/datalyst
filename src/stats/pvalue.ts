/**
 * Two-tailed p-values from a t statistic, and the incomplete beta function they need.
 *
 * This is a straight Numerical Recipes `betacf` (Lentz's algorithm) and it is checked against
 * published t-table values in `pvalue.test.ts`. The previous version got the Lentz recurrence
 * wrong — it fed `h` where `c` belongs — and returned 0 for t = 1, df = 10 (the true value is
 * 0.341) and 1 for t = 2.228, df = 10 (0.050). Every correlation and every N-of-1 result in the
 * app read that number, so the direction of the error mattered: it reported "significant" for
 * genuinely null differences and "not significant" for large ones.
 */

const EPS = 3e-14;
const FPMIN = 1e-300;
const MAX_ITERATIONS = 300;

/**
 * Continued fraction for the incomplete beta function (Numerical Recipes, `betacf`).
 * Must be called with 0 <= x <= 1, a > 0, b > 0.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;

    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= MAX_ITERATIONS; m++) {
        const m2 = 2 * m;

        // Even step
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        h *= d * c;

        // Odd step
        aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const delta = d * c;
        h *= delta;

        if (Math.abs(delta - 1) < EPS) break;
    }

    return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;

    const lnBeta = lnGamma(a + b) - lnGamma(a) - lnGamma(b);
    const front = Math.exp(lnBeta + a * Math.log(x) + b * Math.log(1 - x));

    // The continued fraction converges fast only on one side of this boundary.
    if (x < (a + 1) / (a + b + 2)) {
        return (front * betaContinuedFraction(a, b, x)) / a;
    }
    return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Log-gamma, Lanczos approximation (g = 7). */
export function lnGamma(z: number): number {
    const g = 7;
    const coef = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];

    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }

    z -= 1;
    let x = coef[0];
    for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Two-tailed p-value for a t statistic with `df` degrees of freedom.
 *
 * `P(|T| > |t|) = I_{df/(df+t^2)}(df/2, 1/2)`, which is exact rather than an approximation.
 */
export function tTestPValue(t: number, df: number): number {
    if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
    if (t === 0) return 1;
    const x = df / (df + t * t);
    const p = incompleteBeta(x, df / 2, 0.5);
    if (!Number.isFinite(p)) return 1;
    return Math.min(1, Math.max(0, p));
}
