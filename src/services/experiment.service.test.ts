// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ experiment: { findFirst: vi.fn() }, habitEntry: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mock }));
import { getExperimentResults } from './experiment.service';

it('includes the entire final day in both experiment data queries', async () => {
    mock.experiment.findFirst.mockResolvedValue({
        id: 'trial', userId: 'owner', name: 'Synthetic', status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-10-08',
        independentId: 'input', dependentId: 'outcome', type: 'RANDOMIZED', randomizationType: 'SIMPLE',
        conditions: '[{"label":"A"},{"label":"B"}]', assignments: [],
        independent: { name: 'Input', subvariables: [{ id: 'x', name: 'Input', type: 'NUMERIC' }] },
        dependent: { name: 'Outcome', subvariables: [{ id: 'y', name: 'Outcome', type: 'NUMERIC' }] },
    });
    mock.habitEntry.findMany.mockResolvedValue([]);
    await getExperimentResults('owner', 'trial');
    expect(mock.habitEntry.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of mock.habitEntry.findMany.mock.calls) {
        expect(query.where.userId).toBe('owner');
        expect(query.where.logicalDate).toEqual({ gte: new Date('2026-10-01'), lt: new Date('2026-10-09T00:00:00Z') });
    }
});
