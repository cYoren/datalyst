// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    apiKeyUsage: { upsert: vi.fn() },
    apiKeyEvent: { create: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/agent-auth', () => ({ authenticateAppKey: vi.fn(), authenticateAccountAgent: vi.fn(), authenticateAgent: vi.fn() }));

import { authenticateAppKey } from '@/lib/agent-auth';
import {
    MAX_RANGE_DAYS,
    checkDurableRateLimit,
    daysBetween,
    isCalendarDate,
    requireApp,
    validateValue,
} from './app-api';

const appAgent = {
    apiKeyId: 'key-1',
    userId: 'user-1',
    agentName: 'Advanced Dual N-Back',
    scopes: ['app:read', 'app:write'],
    rateLimitPerMinute: 60,
    appId: 'advanced-dual-n-back',
    readableSubvariableIds: ['var-1'],
};

const request = () => new Request('http://localhost/api/v1/app/me', { headers: { authorization: 'Bearer dl_x' } });

describe('app authentication', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuses a missing or non-app key with 401', async () => {
        vi.mocked(authenticateAppKey).mockResolvedValue(null);
        const result = await requireApp(request(), 'app:read');
        expect('response' in result).toBe(true);
        if ('response' in result) expect(result.response.status).toBe(401);
    });

    it('refuses a scope the app does not hold with 403', async () => {
        vi.mocked(authenticateAppKey).mockResolvedValue({ ...appAgent, scopes: ['app:read'] });
        const result = await requireApp(request(), 'app:write');
        if (!('response' in result)) throw new Error('expected refusal');
        expect(result.response.status).toBe(403);
        expect(await result.response.json()).toMatchObject({ error: { code: 'forbidden_scope' } });
    });

    it('lets an app through with the scope it holds', async () => {
        vi.mocked(authenticateAppKey).mockResolvedValue(appAgent);
        const result = await requireApp(request(), 'app:read');
        expect('agent' in result && result.agent.appId).toBe('advanced-dual-n-back');
    });
});

describe('the durable rate limit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('counts in the database, so two isolates share one limit', async () => {
        prismaMock.apiKeyUsage.upsert.mockResolvedValue({ count: 1 });
        const first = await checkDurableRateLimit('key-1', 60);
        prismaMock.apiKeyUsage.upsert.mockResolvedValue({ count: 2 });
        const second = await checkDurableRateLimit('key-1', 60);

        expect(first).toMatchObject({ allowed: true, limit: 60, remaining: 59 });
        expect(second).toMatchObject({ allowed: true, remaining: 58 });
        // The same minute bucket, incremented in place — not a fresh in-memory counter.
        expect(prismaMock.apiKeyUsage.upsert).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ where: expect.objectContaining({ apiKeyId_windowStart: expect.objectContaining({ apiKeyId: 'key-1' }) }) }),
        );
    });

    it('refuses past the limit and says how long to wait', async () => {
        prismaMock.apiKeyUsage.upsert.mockResolvedValue({ count: 61 });
        const result = await checkDurableRateLimit('key-1', 60);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.resetSeconds).toBeGreaterThan(0);
    });

    it('stays closed when the counter cannot be written', async () => {
        prismaMock.apiKeyUsage.upsert.mockRejectedValue(new Error('database down'));
        await expect(checkDurableRateLimit('key-1', 60)).resolves.toMatchObject({ allowed: false });
    });
});

describe('dates and values', () => {
    it('accepts only real calendar days', () => {
        expect(isCalendarDate('2026-11-14')).toBe(true);
        expect(isCalendarDate('2026-02-31')).toBe(false);
        expect(isCalendarDate('2026-13-01')).toBe(false);
        expect(isCalendarDate('14/11/2026')).toBe(false);
        expect(isCalendarDate(undefined)).toBe(false);
    });

    it('counts a range inclusively, both ends', () => {
        expect(daysBetween('2026-11-14', '2026-11-14')).toBe(1);
        expect(daysBetween('2026-11-01', '2026-11-14')).toBe(14);
        expect(MAX_RANGE_DAYS).toBe(92);
    });

    it('rejects a value the variable cannot hold, in words', () => {
        expect(validateValue('SCALE_0_10', 11, '{}')).toMatch(/0 to 10/);
        expect(validateValue('SCALE_0_10', 7, '{}')).toBeNull();
        expect(validateValue('BOOLEAN', 2, '{}')).toMatch(/yes or no/);
        expect(validateValue('NUMERIC', 5, JSON.stringify({ min: 0, max: 4 }))).toMatch(/at most 4/);
        expect(validateValue('NUMERIC', 5, 'not json')).toBeNull();
        expect(validateValue('NUMERIC', Number.NaN, '{}')).toMatch(/must be a number/);
    });
});
