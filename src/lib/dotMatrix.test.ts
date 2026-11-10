import { buildColumns, cellAlpha, columnAt, niceCeiling, valueAt, type DotPoint, type DotSeries } from '@/lib/dotMatrix';

const points = (pairs: Array<[number, number]>): DotPoint[] => pairs.map(([x, y]) => ({ x, y }));

const series = (overrides: Partial<DotSeries> & Pick<DotSeries, 'id' | 'points'>): DotSeries => ({
    color: '242, 241, 238',
    ...overrides,
});

describe('valueAt', () => {
    const curve = points([[0, 100], [10, 50], [20, 25]]);

    it('returns the exact value at a point', () => {
        expect(valueAt(curve, 10)).toBe(50);
    });

    it('interpolates between points', () => {
        expect(valueAt(curve, 5)).toBe(75);
        expect(valueAt(curve, 15)).toBe(37.5);
    });

    it('is zero outside the sampled range', () => {
        expect(valueAt(curve, -1)).toBe(0);
        expect(valueAt(curve, 21)).toBe(0);
        expect(valueAt([], 3)).toBe(0);
    });

    it('handles a single point without dividing by zero', () => {
        expect(valueAt(points([[5, 7]]), 5)).toBe(7);
    });
});

describe('columnAt', () => {
    it('stacks series bottom to top', () => {
        const column = columnAt(
            [
                series({ id: 'logged', points: points([[0, 100], [10, 100]]) }),
                series({ id: 'planned', color: '157, 159, 255', points: points([[0, 50], [10, 50]]) }),
            ],
            5
        );
        expect(column.total).toBe(150);
        expect(column.layers).toEqual([
            { from: 0, to: 100, color: '242, 241, 238', edge: true },
            { from: 100, to: 150, color: '157, 159, 255', edge: true },
        ]);
    });

    it('drops empty series so no zero-height layer is painted', () => {
        const column = columnAt(
            [series({ id: 'a', points: points([[0, 0]]) }), series({ id: 'b', points: points([[0, 40]]) })],
            0
        );
        expect(column.layers).toHaveLength(1);
        expect(column.layers[0].from).toBe(0);
    });

    it('honours edge: false', () => {
        const column = columnAt([series({ id: 'a', points: points([[0, 10]]), edge: false })], 0);
        expect(column.layers[0].edge).toBe(false);
    });

    it('ignores negative values rather than stacking downwards', () => {
        const column = columnAt([series({ id: 'a', points: points([[0, -20]]) })], 0);
        expect(column.total).toBe(0);
        expect(column.layers).toHaveLength(0);
    });
});

describe('buildColumns', () => {
    it('walks the domain and keeps the last column inside it', () => {
        const columns = buildColumns(
            [series({ id: 'a', points: points([[0, 0], [100, 100]]) })],
            0,
            100,
            10
        );
        expect(columns).toHaveLength(10);
        expect(columns[0].x).toBe(0);
        expect(columns[9].x).toBe(90);
    });

    it('returns nothing for a collapsed domain', () => {
        expect(buildColumns([], 5, 5, 10)).toEqual([]);
        expect(buildColumns([], 0, 10, 0)).toEqual([]);
    });
});

describe('cellAlpha', () => {
    it('is brightest on the curve and dimmest on the axis', () => {
        expect(cellAlpha(100, 100)).toBeCloseTo(0.8, 5);
        expect(cellAlpha(0, 100)).toBeCloseTo(0.06, 5);
    });

    it('falls fast: the middle of a column is well under half brightness', () => {
        expect(cellAlpha(50, 100)).toBeLessThan(0.4);
        expect(cellAlpha(50, 100)).toBeGreaterThan(0.06);
    });

    it('is zero for an empty column and clamps above the curve', () => {
        expect(cellAlpha(10, 0)).toBe(0);
        expect(cellAlpha(200, 100)).toBeCloseTo(cellAlpha(100, 100), 5);
    });
});

describe('niceCeiling', () => {
    it('rounds up with headroom on a readable step', () => {
        expect(niceCeiling(179)).toBe(200);
        expect(niceCeiling(251)).toBe(300);
        expect(niceCeiling(90)).toBe(100);
        expect(niceCeiling(0)).toBe(100);
    });
});
