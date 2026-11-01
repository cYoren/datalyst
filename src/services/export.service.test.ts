import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => Object.fromEntries(
    ['user', 'habit', 'habitEntry', 'habitTemplate', 'experiment', 'appSessionLog', 'userEvent', 'insightsCache', 'aiDailyUsage', 'studyMember', 'studyParticipant']
        .map(name => [name, { findUnique: vi.fn(), findMany: vi.fn() }]),
));
vi.mock('@/lib/prisma', () => ({ prisma }));
import { buildUserExport } from './export.service';

beforeEach(() => {
    vi.resetAllMocks();
    for (const model of Object.values(prisma)) model.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ id: 'owner', aiConsent: true, aiConsentAt: 'synthetic-consent' });
    prisma.insightsCache.findUnique.mockResolvedValue({ aiData: { findings: [] } });
    prisma.aiDailyUsage.findMany.mockResolvedValue([{ day: '2026-10-07', reservedUsd: 0.01 }]);
});

describe('full account AI export', () => {
    it('exports consent, generated evidence and reservations for the authenticated owner', async () => {
        const result = await buildUserExport('owner');
        expect(result.user).toMatchObject({ aiConsent: true });
        expect(result.insightsCache).toEqual({ aiData: { findings: [] } });
        expect(result.aiUsage).toEqual([{ day: '2026-10-07', reservedUsd: 0.01 }]);
        expect(prisma.experiment.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { assignments: true, attestations: true } }));
        expect(prisma.studyParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ consent: true }) }));
        expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'owner' }, select: expect.objectContaining({ aiConsent: true, aiConsentAt: true }),
        }));
        for (const [name, model] of Object.entries(prisma)) {
            const call = (name === 'user' || name === 'insightsCache' ? model.findUnique : model.findMany).mock.calls[0][0];
            expect(call.where).toEqual(name === 'user' ? { id: 'owner' } : { userId: 'owner' });
        }
    });
});
