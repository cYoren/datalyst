import { z } from 'zod';
import { prisma } from '@/lib/prisma';

/**
 * Imports trackers and their entries from a Datalyst export file
 * (GET /api/user/export), so data moves freely between self-hosted and Cloud.
 * ponytail: trackers + entries only; experiments, studies and AI cache are not imported.
 */
const subSchema = z.object({
    id: z.string(),
    name: z.string().min(1).max(100),
    type: z.enum(['NUMERIC', 'SCALE_0_10', 'BOOLEAN', 'CATEGORY']),
    unit: z.string().max(50).nullish(),
    prompt: z.string().max(500).nullish(),
    goalDirection: z.enum(['HIGHER_BETTER', 'LOWER_BETTER', 'NEUTRAL']).optional(),
    metadata: z.unknown().optional(),
    order: z.number().int().optional(),
    active: z.boolean().optional(),
});

const habitSchema = z.object({
    id: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullish(),
    color: z.string().max(20).optional(),
    icon: z.string().max(20).optional(),
    scheduleType: z.enum(['DAILY', 'WEEKLY', 'ADHOC']).optional(),
    scheduleDays: z.array(z.number().int().min(0).max(6)).optional(),
    timeBlock: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME']).optional(),
    rank: z.number().int().optional(),
    archived: z.boolean().optional(),
    subvariables: z.array(subSchema).max(50),
});

const entrySchema = z.object({
    habitId: z.string(),
    timestamp: z.coerce.date().optional(),
    logicalDate: z.coerce.date(),
    note: z.string().max(2000).nullish(),
    source: z.string().max(40).nullish(),
    subvariableEntries: z.array(z.object({
        subvariableId: z.string(),
        numericValue: z.number().finite(),
        rawValue: z.string().max(500).nullish(),
    })).max(50),
});

export const importFileSchema = z.object({
    habits: z.array(habitSchema).max(500),
    entries: z.array(entrySchema).max(200_000),
});

export type ImportResult = { trackers: number; entries: number };

export async function importUserData(userId: string, input: unknown): Promise<ImportResult> {
    const data = importFileSchema.parse(input);

    return prisma.$transaction(async (tx) => {
        const habitIds = new Map<string, string>();
        const subIds = new Map<string, string>();

        for (const habit of data.habits) {
            const created = await tx.habit.create({
                data: {
                    userId,
                    name: habit.name,
                    description: habit.description ?? null,
                    color: habit.color,
                    icon: habit.icon,
                    scheduleType: habit.scheduleType,
                    scheduleDays: habit.scheduleDays,
                    timeBlock: habit.timeBlock,
                    rank: habit.rank,
                    archived: habit.archived,
                    subvariables: {
                        create: habit.subvariables.map((sub) => ({
                            name: sub.name,
                            type: sub.type,
                            unit: sub.unit ?? null,
                            prompt: sub.prompt ?? null,
                            goalDirection: sub.goalDirection,
                            metadata: JSON.stringify(sub.metadata ?? {}),
                            order: sub.order,
                            active: sub.active,
                        })),
                    },
                },
                include: { subvariables: { select: { id: true, order: true, name: true } } },
            });
            habitIds.set(habit.id, created.id);
            // Match new subvariables back by name + order (both copied verbatim above).
            for (const sub of habit.subvariables) {
                const match = created.subvariables.find((s) => s.name === sub.name && s.order === (sub.order ?? 0));
                if (match) subIds.set(sub.id, match.id);
            }
        }

        let entries = 0;
        for (const entry of data.entries) {
            const habitId = habitIds.get(entry.habitId);
            if (!habitId) continue;
            const values = entry.subvariableEntries
                .map((v) => ({ ...v, subvariableId: subIds.get(v.subvariableId) }))
                .filter((v): v is typeof v & { subvariableId: string } => Boolean(v.subvariableId));
            await tx.habitEntry.create({
                data: {
                    userId,
                    habitId,
                    timestamp: entry.timestamp,
                    logicalDate: entry.logicalDate,
                    note: entry.note ?? null,
                    source: entry.source ?? null,
                    subvariableEntries: {
                        create: values.map((v) => ({
                            subvariableId: v.subvariableId,
                            numericValue: v.numericValue,
                            rawValue: v.rawValue ?? null,
                        })),
                    },
                },
            });
            entries++;
        }

        return { trackers: habitIds.size, entries };
    }, { timeout: 120_000 });
}
