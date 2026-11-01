// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    prisma: { $transaction: vi.fn(), experiment: { findFirst: vi.fn() }, experimentAttestation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
    signer: vi.fn(), sign: vi.fn(), submit: vi.fn(), confirm: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/crypto/eas', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/crypto/eas')>(),
    getSigner: mocks.signer, signSnapshot: mocks.sign, submitOnchain: mocks.submit, confirmOnchain: mocks.confirm,
}));
import { completeExperiment, issueAttestation, updateExperimentWithLock } from './attestation.service';

const baseExperiment = { id: 'trial', userId: 'owner', status: 'ACTIVE', name: 'Synthetic', hypothesis: 'Original', startDate: '2026-10-01', endDate: '2026-10-14', hypothesisLockedAt: new Date('2026-10-01'), dependentId: 'outcome' };
const prereg = { id: 'p', experimentId: 'trial', kind: 'PREREG', mode: 'offchain', status: 'SIGNED', uid: `0x${'11'.repeat(32)}`, snapshot: {}, dataHash: `0x${'22'.repeat(32)}` };
describe('Attestation lifecycle authorization and idempotency', () => {
    let tx: {
        $queryRaw: ReturnType<typeof vi.fn>;
        experiment: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
        experimentAttestation: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
        habitEntry: { findMany: ReturnType<typeof vi.fn> };
    };
    beforeEach(() => {
        vi.resetAllMocks();
        tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'trial' }]),
            experiment: { findUniqueOrThrow: vi.fn().mockResolvedValue(baseExperiment), update: vi.fn().mockResolvedValue({ ...baseExperiment, status: 'COMPLETED' }) },
            experimentAttestation: { findUnique: vi.fn(), create: vi.fn() },
            habitEntry: { findMany: vi.fn() },
        };
        mocks.prisma.$transaction.mockImplementation(async fn => fn(tx));
        mocks.prisma.experiment.findFirst.mockResolvedValue({ id: 'trial' });
        mocks.prisma.experimentAttestation.update.mockImplementation(async ({ data }) => ({ ...prereg, ...data }));
        mocks.signer.mockReturnValue({ address: '0x1111111111111111111111111111111111111111' });
    });
    it('rejects non-owners before snapshot reads or signing', async () => {
        tx.$queryRaw.mockResolvedValue([]);
        await expect(completeExperiment('trial', 'stranger')).rejects.toMatchObject({ status: 404 });
        expect(tx.experimentAttestation.findUnique).not.toHaveBeenCalled();
        expect(mocks.sign).not.toHaveBeenCalled();
        mocks.prisma.experiment.findFirst.mockResolvedValue(null);
        await expect(issueAttestation('trial', 'stranger', 'PREREG')).rejects.toMatchObject({ status: 404 });
        expect(mocks.prisma.experiment.findFirst).toHaveBeenCalledWith({ where: { id: 'trial', userId: 'stranger' }, select: { id: true } });
    });
    it('rejects changed locked hypothesis and dates without writing', async () => {
        await expect(updateExperimentWithLock('trial', 'owner', { hypothesis: 'Changed' })).rejects.toThrow('immutable');
        await expect(updateExperimentWithLock('trial', 'owner', { endDate: '2026-11-01' })).rejects.toThrow('immutable');
        expect(tx.experiment.update).not.toHaveBeenCalled();
    });
    it('prevents restarting completed trials or resetting to planning', async () => {
        tx.experiment.findUniqueOrThrow.mockResolvedValue({ ...baseExperiment, status: 'COMPLETED' });
        await expect(updateExperimentWithLock('trial', 'owner', { status: 'ACTIVE' })).rejects.toThrow('cannot restart');
        await expect(updateExperimentWithLock('trial', 'owner', { status: 'PLANNING' })).rejects.toThrow('cannot return');
    });
    it('completes repeated requests without replacing frozen records or publishing', async () => {
        tx.experimentAttestation.findUnique.mockImplementation(async ({ where }) => where.experimentId_kind.kind === 'PREREG' ? prereg : { ...prereg, kind: 'RESULTS' });
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue(prereg);
        await completeExperiment('trial', 'owner');
        await completeExperiment('trial', 'owner');
        expect(tx.experimentAttestation.create).not.toHaveBeenCalled();
        expect(tx.experiment.update).toHaveBeenCalledWith({ where: { id: 'trial' }, data: { status: 'COMPLETED' } });
        expect(mocks.sign).not.toHaveBeenCalled();
    });
    it('completes legacy trials without inventing a preregistration', async () => {
        tx.experimentAttestation.findUnique.mockResolvedValue(null);
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue(null);
        const result = await completeExperiment('trial', 'owner');
        expect(result.attestation).toBeNull();
        expect(tx.experimentAttestation.create).not.toHaveBeenCalled();
    });
    it('freezes the registered outcome with daily aggregation and full last-day coverage', async () => {
        tx.experimentAttestation.findUnique.mockImplementation(async ({ where }) => where.experimentId_kind.kind === 'PREREG' ? {
            ...prereg, snapshot: { dependentSubvariableId: 'registered-outcome', assignments: [
                { date: '2026-10-14', condition: 'A', isWashout: false },
                { date: '2026-10-13', condition: 'B', isWashout: true },
            ] },
        } : null);
        tx.habitEntry.findMany.mockResolvedValue([
            { logicalDate: new Date('2026-10-14T12:00:00Z'), subvariableEntries: [{ numericValue: 2 }] },
            { logicalDate: new Date('2026-10-14T18:00:00Z'), subvariableEntries: [{ numericValue: 4 }] },
            { logicalDate: new Date('2026-10-13T12:00:00Z'), subvariableEntries: [{ numericValue: 100 }] },
        ]);
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue(prereg);
        await completeExperiment('trial', 'owner');
        expect(tx.habitEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'owner', habitId: 'outcome', logicalDate: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-10-15T00:00:00Z') } },
            include: { subvariableEntries: { where: { subvariableId: 'registered-outcome' } } },
        }));
        const data = tx.experimentAttestation.create.mock.calls[0][0].data;
        expect(data.snapshot.conditionSummaries).toEqual([{ condition: 'A', n: 1, mean: 3 }, { condition: 'B', n: 0, mean: null }]);
        expect(data.snapshot.observations).toContainEqual({ date: '2026-10-14', value: 3, entryCount: 2, condition: 'A', isWashout: false });
        expect(data.snapshot.preregistrationHash).toBe(prereg.dataHash);
        expect(data.dataHash).toMatch(/^0x[0-9a-f]{64}$/);
    });
    it('keeps immutable snapshots when signing configuration is missing', async () => {
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue({ ...prereg, uid: null, status: 'PENDING' });
        mocks.signer.mockImplementation(() => { throw new Error('missing'); });
        await issueAttestation('trial', 'owner', 'PREREG');
        expect(mocks.prisma.experimentAttestation.update).toHaveBeenCalledWith({ where: { experimentId_kind: { experimentId: 'trial', kind: 'PREREG' } }, data: { status: 'UNAVAILABLE' } });
        expect(mocks.sign).not.toHaveBeenCalled();
    });
    it('does not sign when a concurrent request won the claim', async () => {
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue({ ...prereg, uid: null, status: 'PENDING' });
        mocks.prisma.experimentAttestation.updateMany.mockResolvedValue({ count: 0 });
        await issueAttestation('trial', 'owner', 'PREREG');
        expect(mocks.sign).not.toHaveBeenCalled();
    });
    it('never resubmits a transaction when confirmation is uncertain', async () => {
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue({ ...prereg, mode: 'onchain', uid: null, status: 'SUBMITTING', txHash: `0x${'33'.repeat(32)}` });
        mocks.confirm.mockRejectedValue(new Error('timeout'));
        await issueAttestation('trial', 'owner', 'PREREG');
        expect(mocks.confirm).toHaveBeenCalledOnce();
        expect(mocks.submit).not.toHaveBeenCalled();
        mocks.prisma.experimentAttestation.findUnique.mockResolvedValue({ ...prereg, mode: 'onchain', uid: null, status: 'SUBMITTING', txHash: null });
        await issueAttestation('trial', 'owner', 'PREREG');
        expect(mocks.submit).not.toHaveBeenCalled();
    });
});
