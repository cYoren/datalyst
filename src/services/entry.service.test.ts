// @vitest-environment node
/**
 * A dose tracker counts events: each log is a new entry. Everything else keeps
 * upserting one value per day. This is the difference between a curve and a
 * single overwritten number.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
    habit: { findFirst: vi.fn() },
    habitEntry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subvariableEntry: { create: vi.fn(), update: vi.fn() },
    experiment: { findFirst: vi.fn() },
    userEvent: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mock }));

import { EntryService } from './entry.service';

const day = '2026-11-09';

function habitWith(metadata: Record<string, unknown>) {
    return {
        id: 'habit-1',
        userId: 'user-1',
        archived: false,
        subvariables: [
            {
                id: 'var-1',
                type: 'NUMERIC',
                metadata: JSON.stringify(metadata),
            },
        ],
    };
}

const input = {
    habitId: 'habit-1',
    subvariableId: 'var-1',
    numericValue: 95,
    logicalDate: day,
};

describe('EntryService.quickEntry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mock.habit.findFirst.mockResolvedValue(habitWith({ aggregation: 'sum' }));
        mock.experiment.findFirst.mockResolvedValue(null);
        mock.habitEntry.findFirst.mockResolvedValue(null);
        mock.habitEntry.create.mockResolvedValue({
            id: 'entry-1',
            source: null,
            subvariableEntries: [],
        });
        mock.subvariableEntry.create.mockResolvedValue({ id: 'sub-1', numericValue: 95 });
    });

    it('appends a new entry for a dose tracker instead of reusing today', async () => {
        const result = await EntryService.quickEntry('user-1', input);

        expect(mock.habitEntry.findFirst).not.toHaveBeenCalled();
        expect(mock.habitEntry.create).toHaveBeenCalledTimes(1);
        expect(mock.subvariableEntry.update).not.toHaveBeenCalled();
        expect(result?.created).toBe(true);
    });

    it('still updates today for a plain daily variable', async () => {
        mock.habit.findFirst.mockResolvedValue(habitWith({ step: 5 }));
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            source: null,
            subvariableEntries: [{ id: 'sub-0', subvariableId: 'var-1' }],
        });
        mock.subvariableEntry.update.mockResolvedValue({ id: 'sub-0', numericValue: 95 });

        const result = await EntryService.quickEntry('user-1', input);

        expect(mock.habitEntry.create).not.toHaveBeenCalled();
        expect(mock.subvariableEntry.update).toHaveBeenCalledTimes(1);
        expect(result?.created).toBe(false);
    });
});
