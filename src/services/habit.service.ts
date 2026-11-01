import { prisma } from '@/lib/prisma';
import { createHabitSchema, updateHabitSchema, createSubvariableSchema } from '@/lib/validations';
import { z } from 'zod';
import { SubvariableType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TemplateService } from './template.service';
import type { HabitSchedule } from '@/types';

type SubvariableInput = Omit<z.infer<typeof createSubvariableSchema>, 'habitId'> & {
    id?: string; // Optional ID for existing subvariables
};

type CreateHabitInput = z.infer<typeof createHabitSchema> & {
    subvariables: SubvariableInput[];
    templateId?: string; // Optional template to use
};

type UpdateHabitInput = z.infer<typeof updateHabitSchema> & {
    subvariables?: SubvariableInput[];
    archived?: boolean;
};

type HabitData = Omit<CreateHabitInput, 'subvariables' | 'templateId'>;

export class HabitService {
    /**
     * Creates a new habit with its initial subvariables
     * Optionally uses a template to pre-populate data
     */
    static async createHabit(userId: string, data: CreateHabitInput) {
        const { subvariables, templateId, ...habitData } = data;

        // If templateId provided, load template and merge with provided data
        let finalHabitData: HabitData = { ...habitData };
        let finalSubvariables = subvariables;

        if (templateId) {
            const template = await TemplateService.getTemplateById(userId, templateId);
            if (!template) {
                throw new Error('Template not found');
            }

            // Merge template data with provided data (provided data takes precedence)
            finalHabitData = {
                name: habitData.name || template.name,
                description: habitData.description || template.description || undefined,
                color: habitData.color || template.color,
                icon: habitData.icon || template.icon,
                schedule: habitData.schedule || template.defaultSchedule as HabitData['schedule'],
                // New Protocol Rules (use provided or defaults)
                scheduleType: habitData.scheduleType || 'DAILY',
                scheduleDays: habitData.scheduleDays || [],
                timeBlock: habitData.timeBlock || 'ANYTIME',
            };

            // Use template subvariables if none provided
            if (!subvariables || subvariables.length === 0) {
                finalSubvariables = template.subvariableTemplate as SubvariableInput[];
            }
        }

        // Use a transaction to create habit and subvariables together
        const habit = await prisma.$transaction(async (tx) => {
            const newHabit = await tx.habit.create({
                data: {
                    userId,
                    templateId: templateId || null,
                    name: finalHabitData.name,
                    description: finalHabitData.description,
                    color: finalHabitData.color,
                    icon: finalHabitData.icon,
                    // New Protocol Rules fields
                    scheduleType: finalHabitData.scheduleType || 'DAILY',
                    scheduleDays: finalHabitData.scheduleDays || [],
                    timeBlock: finalHabitData.timeBlock || 'ANYTIME',
                    // Legacy (backward compat)
                    schedule: JSON.stringify(finalHabitData.schedule || {}),
                },
            });

            if (finalSubvariables && finalSubvariables.length > 0) {
                await tx.subvariable.createMany({
                    data: finalSubvariables.map((sub, index) => ({
                        habitId: newHabit.id,
                        name: sub.name,
                        type: sub.type as SubvariableType,
                        unit: sub.unit,
                        prompt: sub.prompt || null,
                        goalDirection: sub.goalDirection || 'NEUTRAL',
                        metadata: JSON.stringify(sub.metadata || {}),
                        order: sub.order ?? index,
                    })),
                });
            }

            return newHabit;
        });

        // Record template usage if template was used
        if (templateId) {
            await TemplateService.recordTemplateUsage(templateId);
        }

        return habit;
    }

    /**
     * Updates an existing habit and optionally its subvariables
     */
    static async updateHabit(userId: string, habitId: string, data: UpdateHabitInput) {
        // Verify ownership
        const existing = await prisma.habit.findUnique({
            where: { id: habitId },
            include: {
                subvariables: true
            }
        });

        if (!existing || existing.userId !== userId) {
            throw new Error('Habit not found or access denied');
        }

        return await prisma.$transaction(async (tx) => {
            // Update habit basic fields
            const updateData: Prisma.HabitUpdateInput = {};
            if (data.name !== undefined) updateData.name = data.name;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.color !== undefined) updateData.color = data.color;
            if (data.icon !== undefined) updateData.icon = data.icon;
            if (data.archived !== undefined) updateData.archived = data.archived;
            // New Protocol Rules fields
            if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType;
            if (data.scheduleDays !== undefined) updateData.scheduleDays = data.scheduleDays;
            if (data.timeBlock !== undefined) updateData.timeBlock = data.timeBlock;
            // Legacy
            if (data.schedule) {
                updateData.schedule = JSON.stringify(data.schedule);
            }

            const updatedHabit = await tx.habit.update({
                where: { id: habitId },
                data: updateData,
            });

            // Handle subvariables update if provided
            if (data.subvariables !== undefined) {
                const existingSubIds = existing.subvariables.map(s => s.id);
                const providedSubs = data.subvariables;

                // Track which existing subs are still present
                const providedSubIds = providedSubs
                    .filter((s) => s.id)
                    .map((s) => s.id);

                // Soft delete subvariables that are no longer in the list
                const subsToDeactivate = existingSubIds.filter(id => !providedSubIds.includes(id));
                if (subsToDeactivate.length > 0) {
                    await tx.subvariable.updateMany({
                        where: { id: { in: subsToDeactivate } },
                        data: { active: false }
                    });
                }

                // Update or create subvariables
                for (const [index, sub] of providedSubs.entries()) {
                    const subData = {
                        name: sub.name,
                        type: sub.type as SubvariableType,
                        unit: sub.unit,
                        prompt: sub.prompt || null,
                        goalDirection: sub.goalDirection || 'NEUTRAL',
                        metadata: JSON.stringify(sub.metadata || {}),
                        order: index,
                        active: true,
                    };

                    if (sub.id && existingSubIds.includes(sub.id)) {
                        // Update existing subvariable
                        await tx.subvariable.update({
                            where: { id: sub.id },
                            data: subData,
                        });
                    } else {
                        // Create new subvariable
                        await tx.subvariable.create({
                            data: {
                                ...subData,
                                habitId: habitId,
                            },
                        });
                    }
                }
            }

            return updatedHabit;
        });
    }

    /**
     * Soft deletes a habit (archives it)
     */
    static async deleteHabit(userId: string, habitId: string) {
        const existing = await prisma.habit.findUnique({
            where: { id: habitId },
        });

        if (!existing || existing.userId !== userId) {
            throw new Error('Habit not found or access denied');
        }

        return await prisma.habit.update({
            where: { id: habitId },
            data: { archived: true },
        });
    }

    /**
     * Retrieves all active habits for a user
     */
    static async getUserHabits(userId: string) {
        const habits = await prisma.habit.findMany({
            where: {
                userId,
                archived: false,
            },
            include: {
                subvariables: {
                    where: { active: true },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Parse JSON fields
        return habits.map(habit => {
            let schedule: HabitSchedule = {};
            try {
                schedule = JSON.parse(habit.schedule) as HabitSchedule;
            } catch (e) {
                console.error(`Failed to parse schedule for habit ${habit.id}`, e);
            }

            return {
                ...habit,
                schedule,
                subvariables: habit.subvariables.map(sub => {
                    let metadata: Record<string, unknown> = {};
                    try {
                        metadata = JSON.parse(sub.metadata) as Record<string, unknown>;
                    } catch (e) {
                        console.error(`Failed to parse metadata for subvariable ${sub.id}`, e);
                    }
                    return {
                        ...sub,
                        metadata,
                    };
                }),
            };
        });
    }

    /**
     * Retrieves a single habit with details
     */
    static async getHabitById(userId: string, habitId: string) {
        const habit = await prisma.habit.findUnique({
            where: { id: habitId },
            include: {
                subvariables: {
                    where: { active: true },
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!habit || habit.userId !== userId) {
            return null;
        }

        return {
            ...habit,
            schedule: JSON.parse(habit.schedule),
            subvariables: habit.subvariables.map(sub => ({
                ...sub,
                metadata: JSON.parse(sub.metadata),
            })),
        };
    }
}
