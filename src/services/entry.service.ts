import { prisma } from '@/lib/prisma';
import { createEntrySchema, quickEntrySchema, updateEntrySchema } from '@/lib/validations';
import { normalizeEntryNote } from '@/lib/entryUtils';
import { isSummedVariable } from '@/lib/dailyChart';
import { z } from 'zod';
import { isLogicalDay, logicalDayWindow, utcMidnight } from '@/lib/logical-day';
import { ServiceError } from '@/lib/error-utils';
import { assertAppMayWrite } from '@/lib/connected-apps';

/** The condition labels an experiment stores as JSON, in order. */
export function readConditionLabels(conditions: unknown): string[] {
    try {
        const parsed = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
        if (!Array.isArray(parsed)) return [];
        return parsed.map((condition) => (typeof condition === 'string' ? condition : String(condition?.label ?? '')));
    } catch {
        return [];
    }
}

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
     * Shared by POST /api/entries/quick, the MCP log_checkin tool and the connected-app API.
     * Returns null when the tracker or variable is not the user's.
     *
     * `app` is set only when a connected app is writing (`docs/CONNECTED-APPS.md`). Then the
     * service — not the route — refuses a tracker the app did not create, stores the writer as
     * the entry's source, and refuses to overwrite a value the person edited by hand.
     */
    static async quickEntry(
        userId: string,
        body: QuickEntryInput,
        app?: { appId: string },
    ) {
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

        if (app) assertAppMayWrite(app.appId, habit, userId);

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
        let metadata: { min?: number; max?: number; aggregation?: 'sum' } = {};
        try { metadata = JSON.parse(variable.metadata || '{}'); } catch { /* legacy metadata has no bounds */ }
        if (variable.type === 'NUMERIC' || variable.type === 'SCALE_0_10') {
            if (typeof metadata?.min === 'number' && Number.isFinite(metadata.min) && body.numericValue < metadata.min) throw new ServiceError(`Value must be at least ${metadata.min}`, 400);
            if (typeof metadata?.max === 'number' && Number.isFinite(metadata.max) && body.numericValue > metadata.max) throw new ServiceError(`Value must be at most ${metadata.max}`, 400);
        }

        // Always UTC midnight, so the day means the same thing on a server east of UTC
        // (`src/lib/logical-day.ts`).
        const logicalDate = utcMidnight(body.logicalDate);
        const dayWindow = logicalDayWindow(body.logicalDate);

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

            // An assignment names a condition either by letter ("A") or by the label the
            // experiment carries ("Caffeine"), so resolve it to an index the way the Protocol
            // Command Center does. Comparing the raw string to 'A' made every named condition
            // look like the baseline, which warned people that taking their own coffee was a
            // deviation.
            const labels = readConditionLabels(activeExperiment.conditions);
            const conditionIndex = labels.findIndex(
                (label, index) => todayAssignment.condition === String.fromCharCode(65 + index) || todayAssignment.condition === label
            );
            const expectedValue = conditionIndex === 0 ? 1 : 0;
            const actualValue = body.numericValue;

            // Only a yes/no tracker answers "did you follow the assignment". A dose in mg can
            // never equal the expected 1, so guessing there produces a false warning.
            const inferable = variable.type === 'BOOLEAN';

            if (body.followedAssignment === undefined && inferable) {
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

        // A dose tracker counts events, so every log is a new entry at this moment.
        // Reusing today's entry would overwrite the previous cup and flatten the
        // curve on /levels into one invisible dose.
        const isDose = isSummedVariable({ metadata });

        // Otherwise one entry per day, updated in place.
        let habitEntry = isDose ? null : await prisma.habitEntry.findFirst({
            where: {
                habitId: body.habitId,
                userId: userId,
                logicalDate: { gte: dayWindow.gte, lt: dayWindow.lt },
            },
            include: {
                subvariableEntries: true,
            },
        });
        // Rows written before the UTC-midnight rule took effect carry the server's local
        // midnight; the wide window finds them, this keeps only the ones that are this day.
        if (habitEntry && !isLogicalDay(habitEntry.logicalDate, body.logicalDate)) habitEntry = null;

        const appSource = app ? `app:${app.appId}` : undefined;

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
                    ...(appSource ? { source: appSource } : {}),
                },
                include: {
                    subvariableEntries: true,
                },
            });
            habitEntry = newEntry;
        } else {
            // An app may not overwrite a value the person edited by hand: the source is
            // cleared on a manual edit, and that is the signal to refuse (docs/CONNECTED-APPS.md).
            // Judged per variable, not per day: fixing "Level" by hand must not block the
            // app's resync of "Sensitivity" (`SubvariableEntry.source`).
            if (appSource) {
                const sameVariable = habitEntry.subvariableEntries.find((se) => se.subvariableId === body.subvariableId);
                const handEdited = sameVariable
                    ? (sameVariable as { source?: string | null }).source == null
                    // A day with values but no entry for this variable was filled in by hand.
                    : habitEntry.subvariableEntries.length > 0;
                if (handEdited) {
                    throw new ServiceError('This value was edited by hand, so it is no longer updated by the app', 409);
                }
            }

            const entryUpdateData: { followedAssignment?: boolean; note?: string | null; source?: string | null } = {};
            // Health import adds source to the generated model. Any explicit Check-in
            // edit then turns that imported entry into a manual one, including value-only edits.
            if ('source' in habitEntry) Object.assign(entryUpdateData, { source: appSource ?? null });

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
                    // An app keeps its own provenance; a person's own write clears it.
                    source: appSource ?? null,
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
                    source: appSource ?? null,
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
        // Slack either side, so a row written at a local midnight still lands in the range.
        const gte = new Date(startDate.getTime() - 86_400_000);
        const lt = new Date(endDate.getTime() + 2 * 86_400_000);
        return await prisma.habitEntry.findMany({
            where: {
                userId,
                logicalDate: { gte, lt },
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
