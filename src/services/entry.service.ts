import { prisma } from '@/lib/prisma';
import { createEntrySchema, quickEntrySchema, updateEntrySchema } from '@/lib/validations';
import { normalizeEntryNote } from '@/lib/entryUtils';
import { z } from 'zod';
import { startOfDay, endOfDay, parseISO } from 'date-fns';
import { ServiceError } from '@/lib/error-utils';

type CreateEntryInput = z.infer<typeof createEntrySchema>;
type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type QuickEntryInput = z.infer<typeof quickEntrySchema>;

export class EntryService {
    /**
     * Creates a new habit entry with subvariable values
     */
    static async createEntry(userId: string, data: CreateEntryInput) {
        // Verify habit ownership
        const habit = await prisma.habit.findUnique({
            where: { id: data.habitId },
        });

        if (!habit || habit.userId !== userId) {
            throw new Error('Habit not found or access denied');
        }

        // Check if entry already exists for this date (optional logic, allowing multiple for now but could restrict)
        // For this app, we might want to allow multiple entries per day (e.g. drank water), 
        // or restrict to one. The schema allows multiple. 

        return await prisma.$transaction(async (tx) => {
            const entry = await tx.habitEntry.create({
                data: {
                    habitId: data.habitId,
                    userId,
                    logicalDate: new Date(data.logicalDate),
                    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
                    note: data.note,
                },
            });

            if (data.subvariableEntries && data.subvariableEntries.length > 0) {
                await tx.subvariableEntry.createMany({
                    data: data.subvariableEntries.map(sub => ({
                        habitEntryId: entry.id,
                        subvariableId: sub.subvariableId,
                        numericValue: sub.numericValue,
                        rawValue: sub.rawValue,
                    })),
                });
            }

            // Log event
            await tx.userEvent.create({
                data: {
                    userId,
                    eventType: 'ENTRY_CREATED',
                    entityId: entry.id,
                    metadata: JSON.stringify({ habitId: data.habitId }),
                },
            });

            return entry;
        });
    }

    /**
     * Creates or updates one variable's value for a day (Check-in quick entry).
     * Shared by POST /api/entries/quick and the MCP log_checkin tool.
     * Returns null when the tracker or variable is not the user's.
     */
    static async quickEntry(userId: string, body: QuickEntryInput) {
        // Verify the habit belongs to the user and subvariable exists
        const habit = await prisma.habit.findFirst({
            where: {
                id: body.habitId,
                userId: userId,
                archived: false,
            },
            include: {
                subvariables: {
                    where: {
                        id: body.subvariableId,
                        active: true,
                    },
                },
            },
        });

        if (!habit || habit.subvariables.length === 0) {
            return null;
        }

        const variable = habit.subvariables[0];
        if (!Number.isFinite(body.numericValue)) throw new ServiceError('Value must be a finite number', 400);
        if (variable.type === 'BOOLEAN' && body.numericValue !== 0 && body.numericValue !== 1) {
            throw new ServiceError('Boolean variables require 0 or 1', 400);
        }
        if (variable.type === 'SCALE_0_10' && (body.numericValue < 0 || body.numericValue > 10)) {
            throw new ServiceError('Scale variables require a value from 0 to 10', 400);
        }
        let metadata: { min?: number; max?: number } = {};
        try { metadata = JSON.parse(variable.metadata || '{}'); } catch { /* legacy metadata has no bounds */ }
        if (variable.type === 'NUMERIC' || variable.type === 'SCALE_0_10') {
            if (typeof metadata?.min === 'number' && Number.isFinite(metadata.min) && body.numericValue < metadata.min) throw new ServiceError(`Value must be at least ${metadata.min}`, 400);
            if (typeof metadata?.max === 'number' && Number.isFinite(metadata.max) && body.numericValue > metadata.max) throw new ServiceError(`Value must be at most ${metadata.max}`, 400);
        }

        const logicalDate = parseISO(body.logicalDate);
        const dayStart = startOfDay(logicalDate);
        const dayEnd = endOfDay(logicalDate);

        // ========== EXPERIMENT ENFORCEMENT ==========
        // Check if this habit is the independent variable in an active experiment
        const activeExperiment = await prisma.experiment.findFirst({
            where: {
                independentId: body.habitId,
                userId: userId,
                status: 'ACTIVE',
                startDate: { lte: body.logicalDate },
                endDate: { gte: body.logicalDate },
            },
            include: {
                assignments: {
                    where: { date: body.logicalDate },
                },
            },
        });

        let experimentWarning: string | null = null;
        let autoFollowedAssignment: boolean | undefined = body.followedAssignment;

        if (activeExperiment && activeExperiment.assignments.length > 0) {
            const todayAssignment = activeExperiment.assignments[0];

            // If not explicitly set, try to infer from value
            // Condition 'A' (first) typically means intervention (value 1)
            // Other conditions typically mean control/variant (value 0 for binary)
            const expectedValue = todayAssignment.condition === 'A' ? 1 : 0;
            const actualValue = body.numericValue;

            if (body.followedAssignment === undefined) {
                // User is manually logging without using Protocol Command Center
                // Infer compliance based on whether the value matches expected
                if (!todayAssignment.isWashout) {
                    autoFollowedAssignment = actualValue === expectedValue;
                    if (!autoFollowedAssignment) {
                        experimentWarning = `This entry conflicts with today's protocol assignment. Your compliance was logged as deviated.`;
                    }
                }
            }
        }
        // ========== END EXPERIMENT ENFORCEMENT ==========

        // Check if an entry already exists for this habit on this day
        let habitEntry = await prisma.habitEntry.findFirst({
            where: {
                habitId: body.habitId,
                userId: userId,
                logicalDate: {
                    gte: dayStart,
                    lte: dayEnd,
                },
            },
            include: {
                subvariableEntries: true,
            },
        });

        // If no entry exists, create one
        if (!habitEntry) {
            const newEntry = await prisma.habitEntry.create({
                data: {
                    habitId: body.habitId,
                    userId: userId,
                    logicalDate: logicalDate,
                    followedAssignment: autoFollowedAssignment,
                    note: normalizeEntryNote(body.note) ?? null,
                    timestamp: new Date(),
                },
                include: {
                    subvariableEntries: true,
                },
            });
            habitEntry = newEntry;
        } else {
            const entryUpdateData: { followedAssignment?: boolean; note?: string | null } = {};
            // Health import adds source to the generated model. Any explicit Check-in
            // edit then turns that imported entry into a manual one, including value-only edits.
            if ('source' in habitEntry) Object.assign(entryUpdateData, { source: null });

            if (autoFollowedAssignment !== undefined) {
                entryUpdateData.followedAssignment = autoFollowedAssignment;
            }

            if (body.note !== undefined) {
                entryUpdateData.note = normalizeEntryNote(body.note) ?? null;
            }

            if (Object.keys(entryUpdateData).length) await prisma.habitEntry.update({
                where: { id: habitEntry.id },
                data: entryUpdateData,
            });
        }

        // Check if a subvariable entry already exists
        const existingSubEntry = habitEntry.subvariableEntries.find(
            se => se.subvariableId === body.subvariableId
        );

        let subvariableEntry;

        if (existingSubEntry) {
            // Update existing subvariable entry
            subvariableEntry = await prisma.subvariableEntry.update({
                where: {
                    id: existingSubEntry.id,
                },
                data: {
                    numericValue: body.numericValue,
                    rawValue: body.rawValue,
                },
            });
        } else {
            // Create new subvariable entry
            subvariableEntry = await prisma.subvariableEntry.create({
                data: {
                    habitEntryId: habitEntry.id,
                    subvariableId: body.subvariableId,
                    numericValue: body.numericValue,
                    rawValue: body.rawValue,
                },
            });
        }

        return {
            created: !existingSubEntry,
            entry: {
                habitEntryId: habitEntry.id,
                subvariableEntryId: subvariableEntry.id,
                numericValue: subvariableEntry.numericValue,
                rawValue: subvariableEntry.rawValue,
            },
            warning: experimentWarning,
        };
    }

    /**
     * Updates an existing entry
     */
    static async updateEntry(userId: string, entryId: string, data: UpdateEntryInput) {
        const existing = await prisma.habitEntry.findUnique({
            where: { id: entryId },
            include: { subvariableEntries: true },
        });

        if (!existing || existing.userId !== userId) {
            throw new Error('Entry not found or access denied');
        }

        return await prisma.$transaction(async (tx) => {
            // Update basic info
            const updatedEntry = await tx.habitEntry.update({
                where: { id: entryId },
                data: {
                    logicalDate: data.logicalDate ? new Date(data.logicalDate) : undefined,
                    note: data.note,
                    // Edited by hand: health sync must no longer overwrite it.
                    source: null,
                },
            });

            // Update subvariables if provided
            if (data.subvariableEntries) {
                // We need to update existing ones or create new ones. 
                // Simplest strategy: Delete all existing subvariable entries for this entry and recreate them
                // OR update individually. Recreating is safer for consistency if we send the full list.

                // Let's assume the frontend sends the FULL list of subvariable values for this entry.
                await tx.subvariableEntry.deleteMany({
                    where: { habitEntryId: entryId },
                });

                await tx.subvariableEntry.createMany({
                    data: data.subvariableEntries.map(sub => ({
                        habitEntryId: entryId,
                        subvariableId: sub.subvariableId,
                        numericValue: sub.numericValue,
                        rawValue: sub.rawValue,
                    })),
                });
            }

            return updatedEntry;
        });
    }

    /**
     * Get entries for a specific date range
     */
    static async getEntries(userId: string, startDate: Date, endDate: Date) {
        return await prisma.habitEntry.findMany({
            where: {
                userId,
                logicalDate: {
                    gte: startOfDay(startDate),
                    lte: endOfDay(endDate),
                },
            },
            include: {
                habit: {
                    select: { name: true, icon: true, color: true }
                },
                subvariableEntries: {
                    include: {
                        subvariable: {
                            select: { name: true, type: true, unit: true }
                        }
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    /**
     * Get recent entries for a specific habit (for history view)
     */
    static async getHabitHistory(userId: string, habitId: string, limit = 30) {
        return await prisma.habitEntry.findMany({
            where: {
                userId,
                habitId,
            },
            include: {
                subvariableEntries: true,
            },
            orderBy: { logicalDate: 'desc' },
            take: limit,
        });
    }

    /**
     * Get suggested values based on recent history (last 7 entries)
     */
    static async getSuggestedValues(userId: string, habitId: string) {
        const recentEntries = await prisma.habitEntry.findMany({
            where: { userId, habitId },
            include: { subvariableEntries: true },
            orderBy: { timestamp: 'desc' },
            take: 5,
        });

        if (recentEntries.length === 0) return null;

        // Map subvariableId -> value
        const suggestions: Record<string, number> = {};
        const counts: Record<string, number> = {};

        recentEntries.forEach(entry => {
            entry.subvariableEntries.forEach(sub => {
                if (!suggestions[sub.subvariableId]) {
                    suggestions[sub.subvariableId] = 0;
                    counts[sub.subvariableId] = 0;
                }
                suggestions[sub.subvariableId] += sub.numericValue;
                counts[sub.subvariableId]++;
            });
        });

        // Calculate average
        Object.keys(suggestions).forEach(key => {
            suggestions[key] = suggestions[key] / counts[key];
        });

        return suggestions;
    }
}
