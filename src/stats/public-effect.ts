/** Descriptive binary Cohen d; repeated-person observations require additional inference. */
export function publicEffectSize(a: number[], b: number[], binaryConditions: boolean): number | null {
    if (!binaryConditions || a.length < 2 || b.length < 2 || [...a, ...b].some(value => !Number.isFinite(value))) return null;
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const sumSquares = (values: number[]) => values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0);
    const pooledStd = Math.sqrt((sumSquares(a) + sumSquares(b)) / (a.length + b.length - 2));
    return pooledStd > 0 && Number.isFinite(pooledStd) ? (mean(b) - mean(a)) / pooledStd : null;
}
