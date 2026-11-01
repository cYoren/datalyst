import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('./ai-insights.service', () => ({ aiConfiguration: () => null, InsightAvailabilityError: Error, reserveAiBudget: vi.fn() }));
import { toProposals } from './quick-log.service';

const vars = [
    { id: 'sub-sleep', name: 'Hours', type: 'NUMERIC', unit: 'h', habitId: 'h1', habitName: 'Sleep', habitIcon: 'moon' },
    { id: 'sub-pain', name: 'Pain', type: 'SCALE_0_10', unit: null, habitId: 'h2', habitName: 'Headache', habitIcon: 'brain' },
    { id: 'sub-med', name: 'Took medication?', type: 'BOOLEAN', unit: null, habitId: 'h2', habitName: 'Headache', habitIcon: 'brain' },
];

describe('toProposals', () => {
    it('maps short ids back, clamps scales and booleans, drops unknown ids and duplicates', () => {
        const out = toProposals('Sure! {"values":[{"id":"v0","value":6.5},{"id":"v1","value":14},{"id":"v2","value":3},{"id":"v9","value":1},{"id":"v0","value":2}],"unmatched":["coffee"]}', vars);
        expect(out.proposals.map(p => [p.subvariableId, p.numericValue])).toEqual([['sub-sleep', 6.5], ['sub-pain', 10], ['sub-med', 1]]);
        expect(out.unmatched).toEqual(['coffee']);
    });
    it('survives garbage', () => {
        expect(toProposals('no json here', vars).proposals).toEqual([]);
    });
});
