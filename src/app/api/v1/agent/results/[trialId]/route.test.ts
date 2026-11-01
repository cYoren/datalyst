// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), results: vi.fn(), find: vi.fn(), hasScope: vi.fn(() => true) }));
vi.mock('@/lib/prisma', () => ({ prisma: { experiment: { findFirst: mocks.find } } }));
vi.mock('@/lib/agent-auth', () => ({ authenticateAgent: mocks.authenticate, hasScope: mocks.hasScope, forbiddenScopeResponse: () => new Response('{}', { status: 403 }), unauthorizedResponse: vi.fn() }));
vi.mock('@/services/experiment.service', () => ({ getExperimentResults: mocks.results }));
import { GET } from './route';
const request = () => GET(new NextRequest('http://localhost/api/v1/agent/results/trial'), { params: Promise.resolve({ trialId: 'trial' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue({ userId: 'owner', apiKeyId: 'key', rateLimitPerMinute: 100 }); });
it('uses owner-bound frozen service statistics without recomputing live entries', async () => {
    mocks.results.mockResolvedValue({ dataSource: 'frozen', experiment: { id: 'trial' }, stats: { n1: { nA: 3, nB: 4, conditionAMean: 2, conditionBMean: 8, conditionAStd: 1, conditionBStd: 2, effectSize: 3, effectLabel: 'Large', tTest: { pValue: 0 }, autocorrelation: { isProblematic: true } }, conditionLabels: ['A', 'B'], multiArm: null } });
    mocks.find.mockResolvedValue({ type: 'RANDOMIZED', hypothesisLockedAt: new Date(), isBlind: false, attestations: [] });
    const response = await request();
    const body = await response.json();
    expect(mocks.results).toHaveBeenCalledWith('owner', 'trial');
    expect(body.dataSource).toBe('frozen');
    expect(body.results.conditionB.mean).toBe(8);
    expect(body.results.pValue).toBe(0);
    expect(response.headers.get('cache-control')).toContain('no-store');
});
it('preserves shared service gating for an active trial', async () => {
    mocks.results.mockResolvedValue({ gated: true, experiment: { status: 'ACTIVE' } });
    expect((await (await request()).json()).gated).toBe(true);
    expect(mocks.find).not.toHaveBeenCalled();
});
it('charges forbidden-scope calls against the key rate limit', async () => {
    mocks.hasScope.mockReturnValue(false);
    mocks.authenticate.mockResolvedValue({ userId: 'owner', apiKeyId: 'write-only-key', rateLimitPerMinute: 1 });
    expect((await request()).status).toBe(403);
    expect((await request()).status).toBe(429);
    expect(mocks.results).not.toHaveBeenCalled();
    mocks.hasScope.mockReturnValue(true);
});
