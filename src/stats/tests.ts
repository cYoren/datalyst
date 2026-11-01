import * as ss from 'simple-statistics';
import { tTestPValue } from './pvalue';

export interface TTestResult {
    tStatistic: number;
    pValue: number;
    meanDiff: number;
    significant: boolean;
}

export interface ChiSquareResult {
    chiSquare: number;
    pValue: number;
    significant: boolean;
}

/**
 * Performs an independent two-sample t-test
 * Compares means of two groups (e.g., Satisfaction when Sleep > 7h vs Sleep <= 7h)
 */
export function performTTest(group1: number[], group2: number[]): TTestResult | null {
    if (group1.length < 2 || group2.length < 2) return null;

    const mean1 = ss.mean(group1);
    const mean2 = ss.mean(group2);
    const var1 = ss.variance(group1);
    const var2 = ss.variance(group2);
    const n1 = group1.length;
    const n2 = group2.length;

    // Welch's t-test (unequal variances)
    const numerator = mean1 - mean2;
    const denominator = Math.sqrt((var1 / n1) + (var2 / n2));

    if (denominator === 0) return null;

    const t = numerator / denominator;

    // Degrees of freedom (Welch-Satterthwaite equation)
    const dfNum = Math.pow((var1 / n1) + (var2 / n2), 2);
    const dfDen = (Math.pow(var1 / n1, 2) / (n1 - 1)) + (Math.pow(var2 / n2, 2) / (n2 - 1));
    const df = dfNum / dfDen;

    // Approximate p-value
    const pValue = calculatePValueFromT(t, df);

    return {
        tStatistic: t,
        pValue,
        meanDiff: mean1 - mean2,
        significant: pValue < 0.05
    };
}

/**
 * Performs a Chi-Square test for independence
 * Used for two binary/categorical variables (e.g., Did Gym (Y/N) vs Meditated (Y/N))
 */
export function performChiSquareTest(table: number[][]): ChiSquareResult | null {
    // Expects 2x2 contingency table: [[a, b], [c, d]]
    if (table.length !== 2 || table[0].length !== 2) return null;

    const a = table[0][0];
    const b = table[0][1];
    const c = table[1][0];
    const d = table[1][1];

    const total = a + b + c + d;
    if (total < 10) return null; // Not enough data

    // Calculate expected values
    const row1Total = a + b;
    const row2Total = c + d;
    const col1Total = a + c;
    const col2Total = b + d;

    const expected = [
        [(row1Total * col1Total) / total, (row1Total * col2Total) / total],
        [(row2Total * col1Total) / total, (row2Total * col2Total) / total]
    ];

    // Chi-square statistic
    let chi2 = 0;
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            const obs = table[i][j];
            const exp = expected[i][j];
            if (exp > 0) {
                chi2 += Math.pow(obs - exp, 2) / exp;
            }
        }
    }

    // For df=1, critical value for p=0.05 is 3.841
    // We can use a simplified lookup for p-value
    const pValue = getChiSquarePValue(chi2, 1);

    return {
        chiSquare: chi2,
        pValue,
        significant: pValue < 0.05
    };
}

function calculatePValueFromT(t: number, df: number): number {
    return tTestPValue(t, df);
}

function getChiSquarePValue(chi2: number, df: number): number {
    // Simple lookup for df=1
    if (df === 1) {
        if (chi2 > 10.83) return 0.001;
        if (chi2 > 6.63) return 0.01;
        if (chi2 > 3.84) return 0.05;
        if (chi2 > 2.71) return 0.10;
        return 0.5; // Not significant
    }
    return 0.5; // Fallback
}
