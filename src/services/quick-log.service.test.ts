import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    transaction: vi.fn(),
    habit: { findMany: vi.fn() },
    rateLimit: vi.fn(),
    reserve: vi.fn(),
    execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: mocks.user, habit: mocks.habit, $transaction: mocks.transaction } }));
vi.mock('@/ai/policy/runner', () => ({
    AiExecutionPolicy: class { execute = mocks.execute; },
}));
vi.mock('@/ai/rate-limit', () => ({ checkAiRateLimit: mocks.rateLimit }));
vi.mock('./ai-insights.service', () => ({
    aiConfiguration: () => ({
        modelId: 'fake-model',
        spec: { modelId: 'fake-model', provider: 'fake', displayName: 'fake', contextWindow: 8000, maxOutputTokens: 512, costPerInputTokenUsd: 0.000001, costPerOutputTokenUsd: 0.000002, supportedCapabilities: ['text', 'json_object'] },
        providerName: 'fake',
        privacyUrl: null,
        createProvider: () => ({ name: 'fake', generateText: vi.fn() }),
    }),
    InsightAvailabilityError: class extends Error { constructor(public state: string, public status = 200) { super(state); } },
    reserveAiBudget: mocks.reserve,
}));

import { parseQuickLog, toProposals } from './quick-log.service';

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

describe('parseQuickLog switches', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.findUnique.mockResolvedValue({ aiConsent: true });
        mocks.habit.findMany.mockResolvedValue([{ id: 'h1', name: 'Sleep', icon: 'moon', subvariables: [{ id: 'sub-sleep', name: 'Hours', type: 'NUMERIC', unit: 'h', metadata: null }] }]);
        mocks.rateLimit.mockReturnValue({ allowed: true, limit: 6, remaining: 5, resetSeconds: 60 });
        mocks.user.updateMany.mockResolvedValue({ count: 1 });
        mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ user: mocks.user }));
        mocks.execute.mockResolvedValue({ content: '{"values":[{"id":"v0","value":7}]}', finishReason: 'stop' });
    });

    it('refuses without consent before reading any tracker', async () => {
        mocks.user.findUnique.mockResolvedValue({ aiConsent: false });
        await expect(parseQuickLog('user-1', 'slept 7h')).rejects.toMatchObject({ state: 'consent_required' });
        expect(mocks.habit.findMany).not.toHaveBeenCalled();
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('refuses when the capability is switched off', async () => {
        vi.stubEnv('AI_FEATURE_QUICK_LOG', 'off');
        try {
            await expect(parseQuickLog('user-1', 'slept 7h')).rejects.toMatchObject({ state: 'disabled' });
            expect(mocks.execute).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('refuses once the minute is spent, without calling the provider', async () => {
        mocks.rateLimit.mockReturnValue({ allowed: false, limit: 6, remaining: 0, resetSeconds: 30 });
        await expect(parseQuickLog('user-1', 'slept 7h')).rejects.toMatchObject({ state: 'rate_limited', status: 429 });
        expect(mocks.execute).not.toHaveBeenCalled();
        // The budget hold is taken first, so an over-budget user does not also burn quota.
        expect(mocks.reserve).toHaveBeenCalledTimes(1);
    });

    it('returns proposals and never writes them', async () => {
        const out = await parseQuickLog('user-1', 'slept 7h');
        expect(out.proposals).toHaveLength(1);
        // The service has no write path at all: the user confirms through quick entry.
        expect(mocks.habit.findMany).toHaveBeenCalled();
    });

    it('re-checks consent under the row lock, so a revoke in flight still wins', async () => {
        // Consent was read at the top; the transaction re-asserts it before dispatch, the same
        // way insights does, so a revoke that commits in between stops the request.
        mocks.user.updateMany = vi.fn().mockResolvedValue({ count: 0 });
        await expect(parseQuickLog('user-1', 'slept 7h')).rejects.toMatchObject({ state: 'consent_required' });
        expect(mocks.execute).not.toHaveBeenCalled();
    });
});
