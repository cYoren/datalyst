// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey } from 'viem/accounts';
const mocks = vi.hoisted(() => ({ prisma: {
    $transaction: vi.fn(), $queryRaw: vi.fn(), habit: { findFirst: vi.fn() },
    experiment: { create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    assignment: { createMany: vi.fn() }, habitEntry: { findMany: vi.fn() },
    experimentAttestation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
}, user: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/ensure-user', () => ({ getAuthenticatedUser: mocks.user }));
import { createExperiment, getExperimentResults, type ExperimentFormInput } from './experiment.service';
import { completeExperiment, updateExperimentWithLock } from './attestation.service';
import { handleMcpPost } from '@/lib/mcp';
import { POST as completeRoute } from '@/app/api/experiments/[id]/complete/route';
import { verifyBundle } from '@/lib/crypto/verify-bundle';

const inputId = 'ckabc123def456ghi789jkl0';
const outcomeId = 'ckabc123def456ghi789jkl1';
const form: ExperimentFormInput = { name: 'Synthetic trial', hypothesis: 'Synthetic hypothesis', independentId: inputId, dependentId: outcomeId,
    startDate: '2026-10-01', endDate: '2026-10-08', status: 'ACTIVE', type: 'RANDOMIZED', randomizationType: 'BLOCKED', washoutPeriod: 0, blockSize: 4, isBlind: false, conditions: [{ label: 'A' }, { label: 'B' }] };
type Experiment = Record<string, unknown> & { id: string; userId: string; status: string };
type RecordProof = Record<string, unknown> & { id: string; kind: string; snapshot: unknown; status: string };
let experiment: Experiment | null;
let assignments: Record<string, unknown>[];
let records: Map<string, RecordProof>;
let measurements: { habitId: string; logicalDate: Date; numericValue: number }[];
function hydrated() {
    const variable = (id: string, name: string) => ({ id, name, icon: 'x', subvariables: [{ id: `${id}-variable`, name, type: 'NUMERIC', unit: null }] });
    return { ...experiment, independent: variable(inputId, 'Input'), dependent: variable(outcomeId, 'Outcome'), assignments, attestations: [...records.values()] };
}
beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv('ATTESTATION_MODE', 'offchain'); vi.stubEnv('EAS_SIGNER_PRIVATE_KEY', generatePrivateKey());
    experiment = null; assignments = []; records = new Map(); measurements = [];
    mocks.user.mockResolvedValue({ id: 'owner' });
    mocks.prisma.$transaction.mockImplementation(async fn => fn(mocks.prisma));
    mocks.prisma.$queryRaw.mockImplementation(async (_sql, id, userId) => experiment?.id === id && experiment?.userId === userId ? [{ id }] : []);
    mocks.prisma.habit.findFirst.mockImplementation(async ({ where }) => where.userId === 'owner' && [inputId, outcomeId].includes(where.id) ? { id: where.id } : null);
    mocks.prisma.experiment.create.mockImplementation(async ({ data }) => {
        expect(data.status).toBe('PLANNING');
        experiment = { id: 'trial', analysisParams: '{}', hypothesisLockedAt: null, protocolId: null, ...data };
        return hydrated();
    });
    mocks.prisma.experiment.findFirst.mockImplementation(async ({ where }) => experiment && where.id === experiment.id && where.userId === experiment.userId ? hydrated() : null);
    mocks.prisma.experiment.findUniqueOrThrow.mockImplementation(async () => hydrated());
    mocks.prisma.experiment.update.mockImplementation(async ({ data }) => { Object.assign(experiment!, data); return hydrated(); });
    mocks.prisma.assignment.createMany.mockImplementation(async ({ data }) => { assignments = data; return { count: data.length }; });
    mocks.prisma.habitEntry.findMany.mockImplementation(async ({ where }) => measurements.filter(m => m.habitId === where.habitId).map(m => ({ logicalDate: m.logicalDate, subvariableEntries: [{ numericValue: m.numericValue }] })));
    mocks.prisma.experimentAttestation.findUnique.mockImplementation(async ({ where }) => records.get(where.experimentId_kind.kind) ?? null);
    mocks.prisma.experimentAttestation.create.mockImplementation(async ({ data }) => {
        if (data.kind === 'PREREG') expect(assignments).toHaveLength(8);
        const record = { id: data.kind, uid: null, txHash: null, status: 'PENDING', ...data };
        records.set(data.kind, record); return record;
    });
    mocks.prisma.experimentAttestation.update.mockImplementation(async ({ where, data }) => { const record = records.get(where.experimentId_kind.kind)!; Object.assign(record, data); return record; });
    mocks.prisma.experimentAttestation.updateMany.mockImplementation(async ({ where, data }) => {
        const record = [...records.values()].find(r => r.id === where.id);
        if (!record || !where.status.in.includes(record.status)) return { count: 0 };
        Object.assign(record, data); return { count: 1 };
    });
    mocks.prisma.apiKey.findUnique.mockResolvedValue({ id: 'integration-key', userId: 'owner', name: 'Fixture', scopes: ['read', 'write'], isActive: true, revokedAt: null, rateLimitPerMinute: 1000 });
    mocks.prisma.apiKey.update.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

async function mcp(name: string, args: unknown) {
    const response = await handleMcpPost(new Request('http://localhost/api/mcp', { method: 'POST', headers: { Authorization: 'Bearer synthetic-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
    const payload = await response.json();
    return { error: payload.result.isError, value: JSON.parse(payload.result.content[0].text) };
}
describe('Shared direct/API/MCP experiment lifecycle', () => {
    it('keeps drafts unsigned, then locks the complete assignment schedule and completes once', async () => {
        expect((await createExperiment('owner', { ...form, status: 'PLANNING' })).status).toBe('PLANNING');
        expect(records.size).toBe(0);
        await updateExperimentWithLock('trial', 'owner', { status: 'ACTIVE' });
        expect(records.get('PREREG')?.status).toBe('SIGNED');
        expect((records.get('PREREG')?.snapshot as { assignments: unknown[] }).assignments).toHaveLength(8);
        measurements = [
            { habitId: inputId, logicalDate: new Date('2026-10-08T18:00:00Z'), numericValue: 1 },
            { habitId: outcomeId, logicalDate: new Date('2026-10-08T12:00:00Z'), numericValue: 4 },
            { habitId: outcomeId, logicalDate: new Date('2026-10-08T18:00:00Z'), numericValue: 6 },
        ];
        await completeExperiment('trial', 'owner');
        const uid = records.get('RESULTS')?.uid;
        await completeExperiment('trial', 'owner');
        expect(records.size).toBe(2);
        expect(records.get('RESULTS')?.uid).toBe(uid);
        expect(await verifyBundle({ format: 'datalyst-proof-bundle-v1', records: [...records.values()] } as unknown as Parameters<typeof verifyBundle>[0])).toHaveLength(2);
        const result = await getExperimentResults('owner', 'trial');
        expect(result).toMatchObject({ dataSource: 'frozen', chartData: expect.arrayContaining([{ date: '2026-10-08', independent: 1, dependent: 5, isWashout: false, condition: expect.any(String) }]) });
        mocks.prisma.habitEntry.findMany.mockClear();
        measurements[1].numericValue = 999;
        expect(await getExperimentResults('owner', 'trial')).toEqual(result);
        expect(mocks.prisma.habitEntry.findMany).not.toHaveBeenCalled();
    });
    it('MCP ACTIVE creation uses the same lock and API completion freezes the same results', async () => {
        expect((await mcp('create_experiment', form)).value.status).toBe('ACTIVE');
        expect(records.get('PREREG')?.status).toBe('SIGNED');
        const gated = await mcp('get_experiment_results', { experimentId: 'trial' });
        expect(gated.value.gated).toBe(true);
        expect(gated.value.stats).toBeUndefined();
        const response = await completeRoute(new Request('http://localhost/api/experiments/trial/complete', { method: 'POST' }), { params: Promise.resolve({ id: 'trial' }) });
        expect(response.status).toBe(200);
        expect(records.get('RESULTS')?.status).toBe('SIGNED');
        expect((await mcp('get_experiment_results', { experimentId: 'trial' })).value.dataSource).toBe('frozen');
    });
    it('rejects lifecycle bypass creation and foreign completion', async () => {
        await expect(createExperiment('owner', { ...form, status: 'COMPLETED' })).rejects.toThrow('planning or active');
        await expect(createExperiment('owner', { ...form, endDate: '2028-10-08' })).rejects.toThrow('366');
        await expect(createExperiment('stranger', form)).rejects.toThrow('not found');
        expect(mocks.prisma.experiment.create).not.toHaveBeenCalled();
        await createExperiment('owner', form);
        mocks.user.mockResolvedValue({ id: 'stranger' });
        const response = await completeRoute(new Request('http://localhost/api/experiments/trial/complete', { method: 'POST' }), { params: Promise.resolve({ id: 'trial' }) });
        expect(response.status).toBe(404);
        expect(records.has('RESULTS')).toBe(false);
    });
});
