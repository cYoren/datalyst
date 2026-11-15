// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const hosted = vi.hoisted(() => ({ selfHosted: false }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/self-hosted', () => ({
    get SELF_HOSTED() {
        return hosted.selfHosted;
    },
    CLOUD_URL: 'https://datalyst.one',
    LOCAL_USER: { id: 'local', email: 'local@localhost' },
    localAuthClient: () => null,
}));

import { entitlementFor, may } from './entitlement.service';

beforeEach(() => {
    vi.clearAllMocks();
    hosted.selfHosted = false;
});

describe('reading an account’s plan', () => {
    it('answers Free when the account has no row or an unknown plan', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        expect(await entitlementFor('user-1')).toEqual({ plan: 'free' });

        prismaMock.user.findUnique.mockResolvedValue({ plan: 'mystery' });
        expect(await may('user-1', 'ai-explanations')).toBe(false);
    });

    it('lets a Plus account use a Plus feature and a Free one use the free set', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ plan: 'plus' });
        expect(await may('user-1', 'health-import')).toBe(true);

        prismaMock.user.findUnique.mockResolvedValue({ plan: 'free' });
        expect(await may('user-1', 'health-import')).toBe(false);
        expect(await may('user-1', 'patterns')).toBe(true);
    });

    it('answers yes on a self-hosted install without asking the database', async () => {
        hosted.selfHosted = true;
        expect(await may('user-1', 'health-import')).toBe(true);
        expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
});

describe('the one gate that exists (experiments-in-parallel)', () => {
    it('refuses a second running experiment on Free, naming the one that is running', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ plan: 'free' });
        (prismaMock as unknown as { experiment: { findMany: () => Promise<unknown> } }).experiment = {
            findMany: vi.fn().mockResolvedValue([{ name: 'Caffeine → Focus' }]),
        };

        const { createExperiment } = await import('./experiment.service');
        await expect(
            createExperiment('user-1', {
                name: 'Second', hypothesis: null, independentId: 'h1', dependentId: 'h2',
                startDate: '2026-11-01', endDate: '2026-11-14', status: 'PLANNING', type: 'OBSERVATIONAL',
                randomizationType: 'SIMPLE', washoutPeriod: 0, blockSize: 4, isBlind: false,
                conditions: [{ id: 'A', label: 'A', color: '#000' }],
            } as never),
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Caffeine → Focus') });
    });
});
