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
            logicalDate: new Date(`${day}T00:00:00.000Z`),
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

/**
 * The connected-app rule (docs/CONNECTED-APPS.md): an app writes only to trackers it
 * created, stores itself as the source, and never overwrites a hand-edited value.
 */
describe('EntryService.quickEntry from a connected app', () => {
    const appHabit = () => ({
        ...habitWith({ step: 1 }),
        createdByAppId: 'advanced-dual-n-back',
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mock.experiment.findFirst.mockResolvedValue(null);
        mock.habitEntry.findFirst.mockResolvedValue(null);
        mock.habitEntry.create.mockResolvedValue({ id: 'entry-1', source: null, subvariableEntries: [] });
        mock.subvariableEntry.create.mockResolvedValue({ id: 'sub-1', numericValue: 2.4 });
    });

    it('writes to its own tracker and records itself as the source', async () => {
        mock.habit.findFirst.mockResolvedValue(appHabit());

        await EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' });

        expect(mock.habitEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ source: 'app:advanced-dual-n-back' }) })
        );
    });

    it('is refused a tracker the person created, before anything is written', async () => {
        mock.habit.findFirst.mockResolvedValue({ ...habitWith({ step: 1 }), createdByAppId: null });

        await expect(EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' }))
            .rejects.toMatchObject({ status: 403 });
        expect(mock.habitEntry.create).not.toHaveBeenCalled();
    });

    it("is refused another app's tracker", async () => {
        mock.habit.findFirst.mockResolvedValue({ ...appHabit(), createdByAppId: 'some-other-app' });

        await expect(EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' }))
            .rejects.toMatchObject({ status: 403 });
    });

    it('does not overwrite a day the person edited by hand', async () => {
        mock.habit.findFirst.mockResolvedValue(appHabit());
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            logicalDate: new Date(`${day}T00:00:00.000Z`),
            source: null,
            subvariableEntries: [{ id: 'sub-0', subvariableId: 'var-1' }],
        });

        await expect(EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' }))
            .rejects.toMatchObject({ status: 409 });
        expect(mock.subvariableEntry.update).not.toHaveBeenCalled();
    });

    it('may update a value it wrote itself earlier that day', async () => {
        mock.habit.findFirst.mockResolvedValue(appHabit());
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            logicalDate: new Date(`${day}T00:00:00.000Z`),
            source: 'app:advanced-dual-n-back',
            subvariableEntries: [{ id: 'sub-0', subvariableId: 'var-1', source: 'app:advanced-dual-n-back' }],
        });
        mock.subvariableEntry.update.mockResolvedValue({ id: 'sub-0', numericValue: 2.4 });

        const result = await EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' });

        expect(result?.created).toBe(false);
        expect(mock.habitEntry.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ source: 'app:advanced-dual-n-back' }) })
        );
    });

    it('still lets the person write their own tracker', async () => {
        mock.habit.findFirst.mockResolvedValue({ ...habitWith({ step: 1 }), createdByAppId: null });

        await EntryService.quickEntry('user-1', input);

        expect(mock.habitEntry.create).toHaveBeenCalledTimes(1);
    });
});

describe('per-variable provenance', () => {
    const appHabit = () => ({
        ...habitWith({ step: 1 }),
        createdByAppId: 'advanced-dual-n-back',
    });

    it('still lets the app resync a variable the person did not edit', async () => {
        // The person fixed "Level" by hand; "Sensitivity" (var-1) is still the app's to update.
        mock.habit.findFirst.mockResolvedValue(appHabit());
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            logicalDate: new Date(`${day}T00:00:00.000Z`),
            source: null,
            subvariableEntries: [
                { id: 'sub-1', subvariableId: 'var-1', source: 'app:advanced-dual-n-back' },
                { id: 'sub-2', subvariableId: 'var-level', source: null },
            ],
        });
        mock.subvariableEntry.update.mockResolvedValue({ id: 'sub-1', numericValue: 2.4 });

        const result = await EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' });

        expect(result?.created).toBe(false);
        expect(mock.subvariableEntry.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sub-1' },
                data: expect.objectContaining({ source: 'app:advanced-dual-n-back' }),
            }),
        );
    });

    it('refuses only the variable the person edited', async () => {
        mock.habit.findFirst.mockResolvedValue(appHabit());
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            logicalDate: new Date(`${day}T00:00:00.000Z`),
            source: 'app:advanced-dual-n-back',
            subvariableEntries: [{ id: 'sub-1', subvariableId: 'var-1', source: null }],
        });

        await expect(EntryService.quickEntry('user-1', input, { appId: 'advanced-dual-n-back' }))
            .rejects.toMatchObject({ status: 409 });
    });

    it('clears its own provenance when the person writes the variable themselves', async () => {
        mock.habit.findFirst.mockResolvedValue(habitWith({ step: 5 }));
        mock.habitEntry.findFirst.mockResolvedValue({
            id: 'entry-0',
            logicalDate: new Date(`${day}T00:00:00.000Z`),
            source: 'app:advanced-dual-n-back',
            subvariableEntries: [{ id: 'sub-1', subvariableId: 'var-1', source: 'app:advanced-dual-n-back' }],
        });
        mock.subvariableEntry.update.mockResolvedValue({ id: 'sub-1', numericValue: 90 });

        await EntryService.quickEntry('user-1', input);

        expect(mock.subvariableEntry.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ source: null }) }),
        );
    });
});

/**
 * Compliance inference, with the named conditions a template now always creates
 * (`ROADMAP.md` A2). Condition 'A' is the intervention, whichever way it is named.
 */
describe('EntryService.quickEntry compliance inference', () => {
    const activeExperiment = (conditions: string) => ({
        id: 'exp-1',
        conditions,
        assignments: [{ condition: conditions.includes('Caffeine') ? 'Caffeine' : 'A', isWashout: false }],
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mock.habitEntry.findFirst.mockResolvedValue(null);
        mock.habitEntry.create.mockResolvedValue({ id: 'entry-1', source: null, subvariableEntries: [] });
        mock.subvariableEntry.create.mockResolvedValue({ id: 'sub-1', numericValue: 1 });
    });

    it('reads a named first condition as the intervention, not as the baseline', async () => {
        mock.habit.findFirst.mockResolvedValue({
            ...habitWith({ step: 1 }),
            subvariables: [{ id: 'var-1', type: 'BOOLEAN', metadata: '{}' }],
        });
        mock.experiment.findFirst.mockResolvedValue(activeExperiment(JSON.stringify([{ label: 'Caffeine' }, { label: 'No caffeine' }])));

        const result = await EntryService.quickEntry('user-1', { ...input, numericValue: 1 });

        // Before this, 'Caffeine' !== 'A' meant expected 0, so following the protocol was logged as a deviation.
        expect(result?.warning).toBeNull();
        expect(mock.habitEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ followedAssignment: true }) })
        );
    });

    it('does not judge a dose tracker by a yes/no expectation', async () => {
        mock.habit.findFirst.mockResolvedValue({
            ...habitWith({ step: 5 }),
            subvariables: [{ id: 'var-1', type: 'NUMERIC', metadata: '{}' }],
        });
        mock.experiment.findFirst.mockResolvedValue(activeExperiment(JSON.stringify([{ label: 'Caffeine' }, { label: 'No caffeine' }])));

        const result = await EntryService.quickEntry('user-1', { ...input, numericValue: 60 });

        expect(result?.warning).toBeNull();
        expect(mock.habitEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ followedAssignment: undefined }) })
        );
    });

    it('still catches a binary tracker that contradicts the assignment', async () => {
        mock.habit.findFirst.mockResolvedValue({
            ...habitWith({ step: 1 }),
            subvariables: [{ id: 'var-1', type: 'BOOLEAN', metadata: '{}' }],
        });
        mock.experiment.findFirst.mockResolvedValue(activeExperiment(JSON.stringify([{ label: 'Caffeine' }, { label: 'No caffeine' }])));

        const result = await EntryService.quickEntry('user-1', { ...input, numericValue: 0 });

        expect(result?.warning).toMatch(/conflicts with today's protocol assignment/);
    });
});
