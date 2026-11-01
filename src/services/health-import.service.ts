import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { HEALTH_METRICS, aggregateDaily, dayToLogicalDate, importSchema, planImport } from '@/lib/health-metrics';

type Tx = Prisma.TransactionClient;
export class HealthImportError extends Error {
    constructor(message: string, public status = 403) { super(message); }
}
async function lockOwner(tx: Tx, userId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!rows.length) throw new HealthImportError('Account not found', 404);
}

export async function connectHealthImport(userId: string, source: string, previousConnectionId?: string) {
    return prisma.$transaction(async tx => {
        await lockOwner(tx, userId);
        if (previousConnectionId) await tx.healthImportConnection.updateMany({ where: { id: previousConnectionId, userId }, data: { active: false, revokedAt: new Date() } });
        await tx.user.update({ where: { id: userId }, data: { healthDataConsent: true, healthDataConsentAt: new Date() } });
        return tx.healthImportConnection.create({ data: { userId, source }, select: { id: true, userId: true } });
    });
}

async function ensureTrackers(tx: Tx, userId: string, metricIds: string[]) {
    const metrics = HEALTH_METRICS.filter(m => metricIds.includes(m.id));
    const existing = await tx.habit.findMany({ where: { userId, healthMetric: { in: metricIds } }, select: { healthMetric: true } });
    for (const m of metrics) {
        if (existing.some(h => h.healthMetric === m.id)) continue;
        await tx.habit.create({ data: {
            userId, healthMetric: m.id, name: m.name, icon: m.icon, color: m.color,
            description: 'Imported automatically from your phone.', scheduleType: 'ADHOC',
            subvariables: { create: m.fields.map((f, order) => ({ name: f.name, type: 'NUMERIC', unit: f.unit, goalDirection: f.goal, healthKey: f.key, order })) },
        } });
    }
    return tx.habit.findMany({ where: { userId, healthMetric: { in: metricIds } }, select: {
        id: true, archived: true, subvariables: { select: { id: true, healthKey: true } },
    } });
}

/** Connection revocation, deletion and imports use the same owner lock, across server processes. */
export async function importHealthBatch(userId: string, body: z.infer<typeof importSchema>) {
    return prisma.$transaction(async tx => {
        await lockOwner(tx, userId);
        const connection = await tx.healthImportConnection.findFirst({ where: { id: body.connectionId, userId, active: true, source: body.source } });
        if (!connection) throw new HealthImportError('Health connection is disconnected or belongs to another account');
        const profile = await tx.user.findUnique({ where: { id: userId }, select: { healthDataConsent: true } });
        if (!profile?.healthDataConsent) throw new HealthImportError('Health data consent required');
        const oldest = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
        const newest = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
        const from = body.from < oldest ? oldest : body.from;
        const until = body.until > newest ? newest : body.until;
        if (from >= until) throw new HealthImportError('Import range is outside the supported 92-day window', 400);
        const daily = aggregateDaily(body.samples.filter(s => s.date >= from && s.date < until));
        const days = Object.keys(daily).sort();
        const habits = await ensureTrackers(tx, userId, body.metrics);
        const result = { created: 0, updated: 0, skippedManual: 0, removed: 0 };
        for (const habit of habits) {
            if (habit.archived) continue;
            const valuesFor = (date: string) => habit.subvariables.filter(s => s.healthKey && daily[date]?.[s.healthKey] !== undefined)
                .map(s => ({ subvariableId: s.id, numericValue: daily[date][s.healthKey!] }));
            const habitDays = days.filter(d => valuesFor(d).length);
            // Re-read under row locks. A concurrent manual edit either finishes first
            // (source=null is now visible) or waits, then applies after this import.
            await tx.$queryRaw`SELECT "id" FROM "HabitEntry" WHERE "habitId" = ${habit.id} AND "userId" = ${userId} AND "logicalDate" >= ${dayToLogicalDate(from)} AND "logicalDate" < ${dayToLogicalDate(until)} FOR UPDATE`;
            const existing = await tx.habitEntry.findMany({ where: {
                habitId: habit.id, userId, logicalDate: { gte: dayToLogicalDate(from), lt: dayToLogicalDate(until) },
            }, select: { id: true, logicalDate: true, source: true } });
            const plan = planImport(habitDays, existing.map(e => ({ id: e.id, date: e.logicalDate.toISOString().slice(0, 10), source: e.source })));
            result.skippedManual += plan.skippedManual.length;
            if (plan.remove.length) result.removed += (await tx.habitEntry.deleteMany({ where: { id: { in: plan.remove }, userId, source: { not: null } } })).count;
            for (const date of plan.create) {
                await tx.habitEntry.create({ data: { habitId: habit.id, userId, logicalDate: dayToLogicalDate(date), source: body.source, subvariableEntries: { create: valuesFor(date) } } });
                result.created++;
            }
            for (const { date, entryId } of plan.update) {
                const values = valuesFor(date);
                await tx.subvariableEntry.deleteMany({ where: { habitEntryId: entryId, subvariableId: { notIn: values.map(v => v.subvariableId) } } });
                for (const v of values) await tx.subvariableEntry.upsert({ where: { habitEntryId_subvariableId: { habitEntryId: entryId, subvariableId: v.subvariableId } }, update: { numericValue: v.numericValue }, create: { habitEntryId: entryId, ...v } });
                result.updated++;
            }
        }
        return result;
    }, { timeout: 30_000 });
}

export async function disconnectHealthImport(userId: string, connectionId: string, deleteData: boolean) {
    return prisma.$transaction(async tx => {
        await lockOwner(tx, userId);
        if (!await tx.healthImportConnection.findFirst({ where: { id: connectionId, userId } })) throw new HealthImportError('Health connection not found', 404);
        // Deleting all imported data also revokes other devices, so they cannot recreate it.
        await tx.healthImportConnection.updateMany({ where: { userId, ...(deleteData ? {} : { id: connectionId }) }, data: { active: false, revokedAt: new Date() } });
        if (!deleteData) return { deletedEntries: 0, deletedTrackers: 0 };
        const entries = await tx.habitEntry.deleteMany({ where: { userId, source: { not: null } } });
        const trackers = await tx.habit.deleteMany({ where: { userId, healthMetric: { not: null }, entries: { none: {} }, independentExperiments: { none: {} }, dependentExperiments: { none: {} } } });
        return { deletedEntries: entries.count, deletedTrackers: trackers.count };
    }, { timeout: 30_000 });
}
