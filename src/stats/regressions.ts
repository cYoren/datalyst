import * as ss from 'simple-statistics';

export interface RegressionResult {
    slope: number;
    intercept: number;
    r2: number;
    equation: string;
    predict: (x: number) => number;
}

/**
 * Performs simple linear regression (y = mx + b)
 */
export function performLinearRegression(x: number[], y: number[]): RegressionResult | null {
    if (x.length !== y.length || x.length < 3) return null;

    const data = x.map((val, i) => [val, y[i]]);
    const regression = ss.linearRegression(data);
    const line = ss.linearRegressionLine(regression);
    const r2 = ss.rSquared(data, line);

    return {
        slope: regression.m,
        intercept: regression.b,
        r2,
        equation: `y = ${regression.m.toFixed(2)}x + ${regression.b.toFixed(2)}`,
        predict: line
    };
}
