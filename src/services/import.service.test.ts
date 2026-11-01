import { describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
    habit: { create: vi.fn() },
    habitEntry: { create: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }));
import { importUserData } from './import.service';

describe('importUserData', () => {
    it('remaps tracker and field ids and skips orphan entries', async () => {
        tx.habit.create.mockResolvedValue({ id: 'new-h', subvariables: [{ id: 'new-s', name: 'Pain', order: 0 }] });
        tx.habitEntry.create.mockResolvedValue({});
        const result = await importUserData('me', {
            habits: [{ id: 'old-h', name: 'Headache', subvariables: [{ id: 'old-s', name: 'Pain', type: 'SCALE_0_10', order: 0 }] }],
            entries: [
                { habitId: 'old-h', logicalDate: '2026-10-01', subvariableEntries: [{ subvariableId: 'old-s', numericValue: 6 }] },
                { habitId: 'missing', logicalDate: '2026-10-02', subvariableEntries: [] },
            ],
        });
        expect(result).toEqual({ trackers: 1, entries: 1 });
        const data = tx.habitEntry.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ userId: 'me', habitId: 'new-h' });
        expect(data.subvariableEntries.create).toEqual([{ subvariableId: 'new-s', numericValue: 6, rawValue: null }]);
    });
    it('rejects files that are not exports', async () => {
        await expect(importUserData('me', { hello: 'world' })).rejects.toThrow();
    });
});
