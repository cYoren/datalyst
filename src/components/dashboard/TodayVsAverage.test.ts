import { describe, expect, it } from 'vitest';
import { compareTodayToAverage } from './TodayVsAverage';

const habits = [{
    id: 'h', icon: '😴',
    subvariables: [
        { id: 'hours', name: 'Hours slept', type: 'NUMERIC', unit: 'h' },
        { id: 'ok', name: 'Refreshed', type: 'BOOLEAN' },
    ],
}];
const entry = (day: string, hours: number | null) => ({
    logicalDate: `${day}T12:00:00.000Z`,
    subvariableEntries: [{ subvariableId: 'hours', numericValue: hours }, { subvariableId: 'ok', numericValue: 1 }],
});

describe('compareTodayToAverage', () => {
    it('compares today with the prior days and ignores booleans', () => {
        const rows = compareTodayToAverage(habits, [
            entry('2026-09-24', 8), entry('2026-09-23', 6), entry('2026-09-22', 7), entry('2026-09-21', 5),
        ], '2026-09-24');
        expect(rows).toEqual([expect.objectContaining({ id: 'hours', today: 8, average: 6, days: 3 })]);
    });

    it('needs three prior days and a value today', () => {
        expect(compareTodayToAverage(habits, [entry('2026-09-24', 8), entry('2026-09-23', 6), entry('2026-09-22', 7)], '2026-09-24')).toEqual([]);
        expect(compareTodayToAverage(habits, [entry('2026-09-23', 6), entry('2026-09-22', 7), entry('2026-09-21', 5)], '2026-09-24')).toEqual([]);
    });

    it('drops days outside the 14 day window and null values', () => {
        const rows = compareTodayToAverage(habits, [
            entry('2026-09-24', 8), entry('2026-09-23', 6), entry('2026-09-22', null), entry('2026-09-21', 6), entry('2026-09-20', 6), entry('2026-08-01', 100),
        ], '2026-09-24');
        expect(rows[0]).toMatchObject({ average: 6, days: 3 });
    });
});
