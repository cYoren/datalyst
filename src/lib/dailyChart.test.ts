import { buildDailyRows, isSummedVariable, type DailyRowEntry, type DailyRowSubvariable } from '@/lib/dailyChart';

const subvariables: DailyRowSubvariable[] = [
    { id: 'caffeine', name: 'Caffeine', type: 'NUMERIC', metadata: { aggregation: 'sum' } },
    { id: 'jitters', name: 'Jitters', type: 'SCALE_0_10', metadata: { labels: ['None', 'Wired'] } },
];

const dose = (logicalDate: string, amount: number): DailyRowEntry => ({
    logicalDate,
    subvariableEntries: [{ subvariableId: 'caffeine', numericValue: amount }, { subvariableId: 'jitters', numericValue: 3 }],
});

describe('isSummedVariable', () => {
    it('is true only for the sum aggregation', () => {
        expect(isSummedVariable({ metadata: { aggregation: 'sum' } })).toBe(true);
        expect(isSummedVariable({ metadata: {} })).toBe(false);
        expect(isSummedVariable({ metadata: null })).toBe(false);
    });
});

describe('buildDailyRows', () => {
    it('adds up several doses in one day', () => {
        const rows = buildDailyRows(
            [dose('2026-01-15T08:05:00.000Z', 90), dose('2026-01-15T11:15:00.000Z', 95), dose('2026-01-15T15:30:00.000Z', 75)],
            subvariables
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].Caffeine).toBe(260);
    });

    it('keeps the last reading of a variable that is not summed', () => {
        const rows = buildDailyRows(
            [
                { ...dose('2026-01-15T08:05:00.000Z', 90), subvariableEntries: [{ subvariableId: 'jitters', numericValue: 2 }] },
                { ...dose('2026-01-15T18:05:00.000Z', 90), subvariableEntries: [{ subvariableId: 'jitters', numericValue: 7 }] },
            ],
            subvariables
        );
        expect(rows[0].Jitters).toBe(7);
    });

    it('sorts days oldest first regardless of entry order', () => {
        const rows = buildDailyRows(
            [dose('2026-01-16T09:00:00.000Z', 80), dose('2026-01-15T09:00:00.000Z', 90)],
            subvariables
        );
        expect(rows.map((row) => row.date)).toEqual(['01/15', '01/16']);
        expect(rows[0].fullDate).toBe('Jan 15');
    });

    it('leaves a variable out of a day it was not logged', () => {
        const rows = buildDailyRows(
            [{ logicalDate: '2026-01-15T09:00:00.000Z', subvariableEntries: [{ subvariableId: 'jitters', numericValue: 4 }] }],
            subvariables
        );
        expect(rows[0].Caffeine).toBeUndefined();
        expect(rows[0].Jitters).toBe(4);
    });

    it('ignores entries of variables the habit does not have and bad dates', () => {
        const rows = buildDailyRows(
            [
                { logicalDate: '2026-01-15T09:00:00.000Z', subvariableEntries: [{ subvariableId: 'stranger', numericValue: 5 }] },
                { logicalDate: 'not a date', subvariableEntries: [{ subvariableId: 'caffeine', numericValue: 5 }] },
            ],
            subvariables
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].Caffeine).toBeUndefined();
    });

    it('keeps the category label as text', () => {
        const rows = buildDailyRows(
            [{ logicalDate: '2026-01-15T09:00:00.000Z', subvariableEntries: [{ subvariableId: 'kind', numericValue: 1, rawValue: 'Espresso' }] }],
            [{ id: 'kind', name: 'Kind', type: 'CATEGORY' }]
        );
        expect(rows[0].Kind).toBe('Espresso');
    });
});
