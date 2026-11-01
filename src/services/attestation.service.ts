import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { zeroHash, type Hex } from 'viem';
import {
    canonicalJson, confirmOnchain, getAttestationMode, getSigner, hashExperimentData,
    signSnapshot, submitOnchain, schemaUid, type AttestationKind,
} from '@/lib/crypto/eas';
import { generateBlockedSchedule } from '@/stats/analysis';
import { ServiceError } from '@/lib/error-utils';

export class ExperimentLifecycleError extends ServiceError {
    constructor(message: string, status = 409) { super(message, status); }
}
type Transaction = Prisma.TransactionClient;
export const LOCKED_FIELDS = ['name', 'hypothesis', 'startDate', 'endDate', 'type', 'independentId', 'dependentId',
    'randomizationType', 'washoutPeriod', 'blockSize', 'isBlind', 'analysisParams', 'conditions', 'protocolId'] as const;

async function ownedLocked(tx: Transaction, id: string, userId: string) {
    // Serialize lock, edits, completion and snapshot creation across requests/processes.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Experiment" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    if (!rows.length) throw new ExperimentLifecycleError('Experiment not found', 404);
    return tx.experiment.findUniqueOrThrow({ where: { id } });
}
function json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(canonicalJson(value));
}
type FrozenVariableSelection = { dependentSubvariableId: string; independentSubvariableId: string };
async function freezePreregistration(tx: Transaction, id: string, selection?: FrozenVariableSelection) {
    const existing = await tx.experimentAttestation.findUnique({ where: { experimentId_kind: { experimentId: id, kind: 'PREREG' } } });
    if (existing) return existing;
    const experiment = await tx.experiment.findUniqueOrThrow({ where: { id }, include: {
        assignments: { orderBy: { date: 'asc' } },
        dependent: { include: { subvariables: { where: { active: true, ...(selection ? { id: selection.dependentSubvariableId } : {}) }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 1 } } },
        independent: { include: { subvariables: { where: { active: true, ...(selection ? { id: selection.independentSubvariableId } : {}) }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 1 } } },
    } });
    if (selection && (!experiment.dependent.subvariables.length || !experiment.independent.subvariables.length)) throw new ExperimentLifecycleError('Assigned study variables are not available on their owned trackers');
    const snapshot = json({
        format: 'datalyst-preregistration-v1', experimentId: id,
        nonce: randomBytes(32).toString('hex'), lockedAt: experiment.hypothesisLockedAt!.toISOString(),
        plan: Object.fromEntries(LOCKED_FIELDS.map(field => [field, experiment[field]])),
        dependentSubvariableId: experiment.dependent.subvariables[0]?.id ?? null,
        independentSubvariableId: experiment.independent.subvariables[0]?.id ?? null,
        variables: {
            independent: { name: experiment.independent.name, icon: experiment.independent.icon, subvariable: experiment.independent.subvariables[0] ? {
                id: experiment.independent.subvariables[0].id, name: experiment.independent.subvariables[0].name, unit: experiment.independent.subvariables[0].unit, type: experiment.independent.subvariables[0].type,
            } : null },
            dependent: { name: experiment.dependent.name, icon: experiment.dependent.icon, subvariable: experiment.dependent.subvariables[0] ? {
                id: experiment.dependent.subvariables[0].id, name: experiment.dependent.subvariables[0].name, unit: experiment.dependent.subvariables[0].unit, type: experiment.dependent.subvariables[0].type,
            } : null },
        },
        assignments: experiment.assignments.map(({ date, condition, blockIndex, isWashout }) => ({ date, condition, blockIndex, isWashout })),
        outcomeAggregation: 'arithmetic mean per UTC logical date; non-washout assignments only',
    });
    return tx.experimentAttestation.create({ data: { experimentId: id, kind: 'PREREG', mode: getAttestationMode(), snapshot, dataHash: hashExperimentData(snapshot) } });
}

/** Transaction-level lifecycle for atomic study enrollment; never signs or sends a transaction. */
export async function updateExperimentInTransaction(tx: Transaction, id: string, userId: string, body: Record<string, unknown>, selection?: FrozenVariableSelection) {
        const existing = await ownedLocked(tx, id, userId);
        if (existing.hypothesisLockedAt && LOCKED_FIELDS.some(field => body[field] !== undefined && body[field] !== existing[field])) {
            throw new ExperimentLifecycleError('The registered hypothesis, dates, variables, and analysis plan are immutable');
        }
        if (body.status === 'COMPLETED') throw new ExperimentLifecycleError('Use the completion endpoint to freeze results');
        if (body.status === 'ACTIVE' && !['PLANNING', 'ACTIVE'].includes(existing.status)) throw new ExperimentLifecycleError('Completed or archived experiments cannot restart');
        if (body.status === 'PLANNING' && existing.status !== 'PLANNING') throw new ExperimentLifecycleError('A started experiment cannot return to planning');
        const startDate = String(body.startDate ?? existing.startDate);
        const endDate = String(body.endDate ?? existing.endDate);
        if (endDate <= startDate) throw new ExperimentLifecycleError('End date must be after start date', 400);
        const data: Prisma.ExperimentUpdateInput = {};
        for (const field of ['name', 'hypothesis', 'startDate', 'endDate'] as const) {
            if (body[field] !== undefined) Object.assign(data, { [field]: body[field] });
        }
        if (body.status !== undefined) data.status = body.status as Prisma.ExperimentUpdateInput['status'];
        if (body.status === 'ACTIVE' && !existing.hypothesisLockedAt) data.hypothesisLockedAt = new Date();
        const result = await tx.experiment.update({ where: { id }, data, include: {
            independent: { select: { id: true, name: true, icon: true, color: true } },
            dependent: { select: { id: true, name: true, icon: true, color: true } },
        } });
        if ((body.startDate !== undefined || body.endDate !== undefined) && !existing.hypothesisLockedAt && existing.type !== 'OBSERVATIONAL') {
            const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
            if (days < 8 || days > 366) throw new ExperimentLifecycleError('Experiment duration must be 8 to 366 days', 400);
            const conditions: { label: string }[] = existing.conditions ? JSON.parse(existing.conditions) : [{ label: 'A' }, { label: 'B' }];
            const schedule = generateBlockedSchedule(startDate, days, existing.blockSize, existing.washoutPeriod, undefined, conditions.map(c => c.label));
            await tx.assignment.deleteMany({ where: { experimentId: id } });
            await tx.assignment.createMany({ data: schedule.assignments.map(a => ({ ...a, experimentId: id })) });
        }
        if (data.hypothesisLockedAt) await freezePreregistration(tx, id, selection);
        return result;
}

export async function updateExperimentWithLock(id: string, userId: string, body: Record<string, unknown>) {
    const updated = await prisma.$transaction(tx => updateExperimentInTransaction(tx, id, userId, body));
    if (body.status === 'ACTIVE') await issueAttestation(id, userId, 'PREREG');
    return updated;
}

/** Freezes the actual observed dataset. Later tracker edits never alter this proof. */
export async function completeExperiment(id: string, userId: string) {
    const experiment = await prisma.$transaction(async tx => {
        const existing = await ownedLocked(tx, id, userId);
        if (!['ACTIVE', 'COMPLETED'].includes(existing.status)) throw new ExperimentLifecycleError('Only active experiments can be completed');
        const prereg = await tx.experimentAttestation.findUnique({ where: { experimentId_kind: { experimentId: id, kind: 'PREREG' } } });
        // Preserve completion for legacy trials while refusing a retroactive proof.
        if (!prereg) return tx.experiment.update({ where: { id }, data: { status: 'COMPLETED' } });
        const frozen = await tx.experimentAttestation.findUnique({ where: { experimentId_kind: { experimentId: id, kind: 'RESULTS' } } });
        if (!frozen) {
            const plan = prereg.snapshot as { dependentSubvariableId: string | null; independentSubvariableId?: string | null; assignments: { date: string; condition: string; isWashout: boolean }[] };
            async function observationsFor(habitId: string, subvariableId: string | null | undefined) {
                const entries = subvariableId ? await tx.habitEntry.findMany({ where: {
                    userId, habitId,
                    logicalDate: { gte: new Date(`${existing.startDate}T00:00:00Z`), lt: new Date(new Date(`${existing.endDate}T00:00:00Z`).getTime() + 86_400_000) },
                }, include: { subvariableEntries: { where: { subvariableId } } }, orderBy: [{ logicalDate: 'asc' }, { id: 'asc' }] }) : [];
                const days = new Map<string, number[]>();
                for (const entry of entries) {
                    const day = entry.logicalDate.toISOString().slice(0, 10);
                    const values = days.get(day) ?? [];
                    for (const sub of entry.subvariableEntries) if (Number.isFinite(sub.numericValue)) values.push(sub.numericValue);
                    days.set(day, values);
                }
                return [...days].filter(([, values]) => values.length).map(([date, values]) => ({
                    date, value: values.reduce((a, b) => a + b, 0) / values.length, entryCount: values.length,
                    condition: plan.assignments.find(a => a.date === date)?.condition ?? null,
                    isWashout: plan.assignments.find(a => a.date === date)?.isWashout ?? false,
                }));
            }
            const [observations, independentObservations] = await Promise.all([
                observationsFor(existing.dependentId, plan.dependentSubvariableId),
                observationsFor(existing.independentId, plan.independentSubvariableId),
            ]);
            const snapshot = json({ format: 'datalyst-results-v1', experimentId: id,
                nonce: randomBytes(32).toString('hex'), completedAt: new Date().toISOString(),
                preregistrationHash: prereg.dataHash, dependentSubvariableId: plan.dependentSubvariableId,
                independentSubvariableId: plan.independentSubvariableId ?? null,
                aggregation: 'arithmetic mean per UTC logical date', observations, independentObservations,
                conditionSummaries: [...new Set(plan.assignments.map(a => a.condition))].map(condition => {
                    const values = observations.filter(o => o.condition === condition && !o.isWashout).map(o => o.value);
                    return { condition, n: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
                }),
                limitation: 'Descriptive frozen observations; signature does not validate collection, inference, or medical conclusions',
            });
            await tx.experimentAttestation.create({ data: { experimentId: id, kind: 'RESULTS', mode: prereg.mode, snapshot, dataHash: hashExperimentData(snapshot) } });
        }
        // Completion never implicitly publishes personal data.
        return tx.experiment.update({ where: { id }, data: { status: 'COMPLETED' } });
    });
    await issueAttestation(id, userId, 'PREREG');
    const attestation = await issueAttestation(id, userId, 'RESULTS');
    return { experiment, attestation };
}

export async function issueAttestation(experimentId: string, userId: string, kind: AttestationKind) {
    if (!await prisma.experiment.findFirst({ where: { id: experimentId, userId }, select: { id: true } })) throw new ExperimentLifecycleError('Experiment not found', 404);
    const key = { experimentId_kind: { experimentId, kind } };
    let record = await prisma.experimentAttestation.findUnique({ where: key });
    if (!record || record.uid) return record;
    // Never send a second transaction after an uncertain send. Resume receipt checks only.
    if (record.txHash) {
        try {
            const uid = await confirmOnchain(record.txHash as Hex, kind);
            return await prisma.experimentAttestation.update({ where: key, data: { uid, status: 'CONFIRMED' } });
        } catch { return record; }
    }
    if (record.status === 'SUBMITTING' || record.status === 'SIGNING') return record;
    let refUID: Hex = zeroHash;
    if (kind === 'RESULTS') {
        const prereg = await prisma.experimentAttestation.findUnique({ where: { experimentId_kind: { experimentId, kind: 'PREREG' } } });
        if (!prereg?.uid || prereg.mode !== record.mode) return record;
        refUID = prereg.uid as Hex;
    }
    try {
        const signer = getSigner();
        if (kind === 'RESULTS') {
            const prereg = await prisma.experimentAttestation.findUnique({ where: { experimentId_kind: { experimentId, kind: 'PREREG' } } });
            const proof = prereg?.proof as { signer?: string } | null;
            if (proof?.signer?.toLowerCase() !== signer.address.toLowerCase() && record.mode === 'offchain') throw new Error('Original preregistration signer required');
        }
        if (record.mode === 'onchain' && (!process.env.BASE_RPC_URL || process.env[kind === 'PREREG' ? 'EAS_PREREG_SCHEMA_UID' : 'EAS_RESULTS_SCHEMA_UID']?.toLowerCase() !== schemaUid(kind).toLowerCase())) throw new Error('Onchain configuration unavailable');
    } catch {
        return prisma.experimentAttestation.update({ where: key, data: { status: 'UNAVAILABLE' } });
    }
    const status = record.mode === 'offchain' ? 'SIGNING' : 'SUBMITTING';
    const claimed = await prisma.experimentAttestation.updateMany({ where: { id: record.id, status: { in: ['PENDING', 'UNAVAILABLE'] } }, data: { status } });
    if (!claimed.count) return prisma.experimentAttestation.findUnique({ where: key });
    try {
        if (record.mode === 'offchain') {
            const proof = await signSnapshot(kind, record.snapshot, refUID);
            record = await prisma.experimentAttestation.update({ where: key, data: { uid: proof.uid, proof: json(proof), status: 'SIGNED' } });
        } else {
            const txHash = await submitOnchain(kind, record.snapshot, refUID);
            record = await prisma.experimentAttestation.update({ where: key, data: { txHash } });
            const uid = await confirmOnchain(txHash, kind);
            record = await prisma.experimentAttestation.update({ where: key, data: { uid, status: 'CONFIRMED' } });
        }
    } catch {
        // Offchain signing has no external side effect and is safe to retry.
        if (record.mode === 'offchain') record = await prisma.experimentAttestation.update({ where: key, data: { status: 'UNAVAILABLE' } });
        // Onchain SUBMITTING without hash needs operator reconciliation, never automatic resubmission.
    }
    return record;
}
