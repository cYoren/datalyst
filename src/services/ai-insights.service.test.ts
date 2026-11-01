import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    subvariable: { findMany: vi.fn() }, subvariableEntry: { findMany: vi.fn() },
    insightsCache: { findUnique: vi.fn(), upsert: vi.fn() }, aiDailyUsage: { upsert: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
  correlations: vi.fn(), explain: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('./stats.service', () => ({ StatsService: { calculateGlobalCorrelations: mocks.correlations } }));
vi.mock('@/ai/insights', async importOriginal => ({ ...await importOriginal<typeof import('@/ai/insights')>(), explainEvidence: mocks.explain }));
import { generateAiInsights } from './ai-insights.service';
import { buildEvidence, evidenceHash } from '@/ai/insights';

const consentAt = new Date('2026-10-07T00:00:00Z');
const row = { variable1: { id: 'a', habit: 'private', name: 'private' }, variable2: { id: 'b', habit: 'private', name: 'private' }, coefficient: 0.6, pValue: 0.001, n: 20, method: 'pearson' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEEPSEEK_API_KEY', 'synthetic');
  vi.stubEnv('DEEPSEEK_MODEL_ID', 'deepseek-flash');
  vi.stubEnv('AI_DAILY_LIMIT_USD', '0.10');
  mocks.prisma.user.findUnique.mockResolvedValue({ aiConsent: true, aiConsentAt: consentAt });
  mocks.prisma.user.findFirst.mockResolvedValue({ id: 'owner' });
  mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.subvariable.findMany.mockResolvedValue([{ id: 'a', habitId: 'habit-a' }, { id: 'b', habitId: 'habit-b' }]);
  mocks.prisma.subvariableEntry.findMany.mockResolvedValue([]);
  mocks.prisma.aiDailyUsage.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.$transaction.mockImplementation(fn => fn(mocks.prisma));
  mocks.correlations.mockResolvedValue([row]);
  mocks.explain.mockResolvedValue({ version: 1, findings: [] });
});

describe('AI insight consent, ownership and durable budget', () => {
  it('refuses collection and invocation without consent', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ aiConsent: false });
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'consent_required' });
    expect(mocks.correlations).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('degrades without keys before querying measurements', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'unavailable' });
    expect(mocks.correlations).not.toHaveBeenCalled();
  });
  it('scopes evidence, history, cache and reservation to the authenticated owner', async () => {
    await generateAiInsights('owner');
    expect(mocks.correlations).toHaveBeenCalledWith('owner');
    expect(mocks.prisma.subvariableEntry.findMany.mock.calls[0][0].where).toMatchObject({ habitEntry: { userId: 'owner' }, subvariable: { habit: { userId: 'owner' } } });
    expect(mocks.prisma.insightsCache.upsert.mock.calls[0][0].where).toEqual({ userId: 'owner' });
    expect(mocks.prisma.aiDailyUsage.updateMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'owner' }, data: { reservedUsd: { increment: expect.any(Number) } } });
  });
  it('invokes no provider when the atomic reservation fails', async () => {
    mocks.prisma.aiDailyUsage.updateMany.mockResolvedValue({ count: 0 });
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'budget_exceeded', status: 429 });
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('fails closed for invalid budget configuration', async () => {
    vi.stubEnv('AI_DAILY_LIMIT_USD', 'invalid');
    mocks.prisma.aiDailyUsage.updateMany.mockImplementation(({ where }) => ({ count: where.reservedUsd.lte < 0 ? 0 : 1 }));
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'budget_exceeded' });
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('checks revocation again before invocation', async () => {
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'consent_required' });
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('locks consent before dispatch, inside the same transaction as publication', async () => {
    const order: string[] = [];
    mocks.prisma.user.updateMany.mockImplementation(async () => { order.push('lock'); return { count: 1 }; });
    mocks.explain.mockImplementation(async () => { order.push('dispatch'); return { findings: [], nextExperiment: null, limitations: '' }; });
    mocks.prisma.insightsCache.upsert.mockImplementation(async () => { order.push('publish'); });
    mocks.prisma.$transaction.mockImplementation(async fn => { order.push('begin'); const r = await fn(mocks.prisma); order.push('commit'); return r; });
    await generateAiInsights('owner');
    expect(order).toEqual(['begin', 'lock', 'dispatch', 'publish', 'commit']);
  });
  it('does not publish a result after consent was withdrawn in flight', async () => {
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'consent_required' });
    expect(mocks.prisma.insightsCache.upsert).not.toHaveBeenCalled();
  });
  it('checks revocation on a cache hit without charging for cached results', async () => {
    const facts = buildEvidence([{ ...row, variable1: { ...row.variable1, habitId: 'habit-a' }, variable2: { ...row.variable2, habitId: 'habit-b' } }]);
    mocks.prisma.insightsCache.findUnique.mockResolvedValue({ aiEvidenceHash: evidenceHash(facts, {}, 'deepseek-flash'), aiExpiresAt: new Date(Date.now() + 60000), aiData: { version: 3, synthetic: true } });
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    await expect(generateAiInsights('owner')).rejects.toMatchObject({ state: 'consent_required' });
    expect(mocks.prisma.aiDailyUsage.updateMany).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('does not serve a cached payload from an older result version', async () => {
    const facts = buildEvidence([{ ...row, variable1: { ...row.variable1, habitId: 'habit-a' }, variable2: { ...row.variable2, habitId: 'habit-b' } }]);
    mocks.prisma.insightsCache.findUnique.mockResolvedValue({ aiEvidenceHash: evidenceHash(facts, {}, 'deepseek-flash'), aiExpiresAt: new Date(Date.now() + 60000), aiData: { version: 2, nextExperiment: { independentId: 'a' } } });
    const result = await generateAiInsights('owner');
    expect(result.cached).toBe(false);
    expect(mocks.explain).toHaveBeenCalled();
  });
});
