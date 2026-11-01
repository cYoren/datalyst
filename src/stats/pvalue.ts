/**
 * Proper p-value calculation using the regularized incomplete beta function.
 * Replaces the incorrect `1 / (1 + absT)` linear approximation.
 */

/**
 * Regularized incomplete beta function I_x(a, b) using continued fraction.
 * Used to compute the CDF of the t-distribution.
 */
function betaIncomplete(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use symmetry relation when x > (a+1)/(a+b+2)
    if (x > (a + 1) / (a + b + 2)) {
        return 1 - betaIncomplete(1 - x, b, a);
    }

    const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

    // Lentz's continued fraction
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= 200; m++) {
        // Even step
        let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        d = 1 / d;
        let c = 1 + numerator / (Math.abs(h) < 1e-30 ? 1e-30 : h);
        if (Math.abs(c) < 1e-30) c = 1e-30;
        h *= d * c;

        // Odd step
        numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        d = 1 / d;
        c = 1 + numerator / (Math.abs(h) < 1e-30 ? 1e-30 : h);
        if (Math.abs(c) < 1e-30) c = 1e-30;
        const delta = d * c;
        h *= delta;

        if (Math.abs(delta - 1) < 1e-10) break;
    }

    return front * h;
}

/**
 * Log-gamma function using Lanczos approximation.
 */
function lnGamma(z: number): number {
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
    for (let i = 1; i < g + 2; i++) {
        x += coef[i] / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Two-tailed p-value from a t-statistic and degrees of freedom.
 * Uses the regularized incomplete beta function for accuracy.
 */
export function tTestPValue(t: number, df: number): number {
    if (df <= 0) return 1.0;
    const x = df / (df + t * t);
    const p = betaIncomplete(x, df / 2, 0.5);
    return Math.min(1, Math.max(0, p));
}
