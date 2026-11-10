/**
 * Dot-matrix area geometry.
 *
 * One shared model for every chart in the app that draws a quantity over time:
 * series are **stacked** (bottom to top) and sampled at every column, and each
 * column becomes a stack of layers. The painter only needs, per column, the total
 * height and who owns each slice of it, which keeps the drawing dumb and testable
 * and keeps the look identical wherever it is used.
 *
 * The look itself: a dot per cell, brightest on the curve and fading to a dim
 * floor at the baseline, with a brighter row where each series' own top edge
 * lands. That edge is what lets several stacked things stay readable as several.
 */

export interface DotPoint {
    /** Position on the x axis, in the caller's units. */
    x: number;
    y: number;
}

export interface DotSeries {
    id: string;
    /** `r, g, b` so the painter can build any alpha without parsing. */
    color: string;
    /** Stack order: index 0 sits on the baseline. */
    points: DotPoint[];
    /** Draw the brighter edge row where this series ends. Default true. */
    edge?: boolean;
}

export interface ColumnLayer {
    /** Height where this layer starts, in chart units. */
    from: number;
    /** Height where it ends. */
    to: number;
    color: string;
    edge: boolean;
}

export interface DotColumn {
    x: number;
    /** Stacked total at this column. */
    total: number;
    /** Bottom to top. */
    layers: ColumnLayer[];
}

/** Value of one series at `x`: linear between points, zero outside its range. */
export function valueAt(points: DotPoint[], x: number): number {
    if (points.length === 0) return 0;
    if (x < points[0].x || x > points[points.length - 1].x) {
        // Before the first point a series has not started; after the last it may
        // still be decaying, so the caller is expected to sample to the edge.
        return 0;
    }

    let low = 0;
    let high = points.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (points[mid].x === x) return points[mid].y;
        if (points[mid].x < x) low = mid + 1;
        else high = mid - 1;
    }

    const after = points[low];
    const before = points[low - 1] ?? after;
    const span = after.x - before.x;
    if (span <= 0) return after.y;
    const ratio = (x - before.x) / span;
    return before.y + (after.y - before.y) * ratio;
}

/** Stack the series at one x into layers, bottom to top. */
export function columnAt(series: DotSeries[], x: number): DotColumn {
    const layers: ColumnLayer[] = [];
    let height = 0;

    for (const item of series) {
        const value = Math.max(0, valueAt(item.points, x));
        if (value <= 0) continue;
        layers.push({ from: height, to: height + value, color: item.color, edge: item.edge !== false });
        height += value;
    }

    return { x, total: height, layers };
}

/** Every column across the domain, at `pitch` x-units. */
export function buildColumns(series: DotSeries[], min: number, max: number, count: number): DotColumn[] {
    if (max <= min || count <= 0) return [];
    const step = (max - min) / count;
    const columns: DotColumn[] = [];
    // The last column sits one step inside max so the final dot is not clipped.
    for (let index = 0; index < count; index++) {
        columns.push(columnAt(series, min + index * step));
    }
    return columns;
}

/**
 * Alpha for a cell inside a column: a fast ramp from the curve down to a dim
 * floor on the axis, so the shape never dissolves before the baseline.
 */
export function cellAlpha(heightAboveBaseline: number, total: number, max = 0.8, min = 0.06, curve = 1.55): number {
    if (total <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, heightAboveBaseline / total));
    return min + (max - min) * Math.pow(ratio, curve);
}

/** A round y ceiling with a little headroom, so the curve never touches the top. */
export function niceCeiling(value: number, headroom = 1.06): number {
    if (value <= 0) return 100;
    const step = value > 400 ? 100 : value > 150 ? 50 : 25;
    return Math.ceil((value * headroom) / step) * step;
}
