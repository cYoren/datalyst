import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

type CreateTemplateInput = {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    defaultSchedule?: unknown;
    subvariableTemplate?: unknown[];
};

type UpdateTemplateInput = {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    defaultSchedule?: unknown;
    subvariableTemplate?: unknown[];
};

export class TemplateService {
    /**
     * Get all templates for a user, ordered by usage
     */
    static async getUserTemplates(userId: string) {
        const templates = await prisma.habitTemplate.findMany({
            where: { userId },
            orderBy: [
                { useCount: 'desc' },
                { lastUsedAt: 'desc' },
                { createdAt: 'desc' }
            ],
        });

        // Parse JSON fields
        return templates.map(template => ({
            ...template,
            defaultSchedule: this.safeJsonParse(template.defaultSchedule, {}),
            subvariableTemplate: this.safeJsonParse(template.subvariableTemplate, []),
        }));
    }

    /**
     * Get a specific template by ID
     */
    static async getTemplateById(userId: string, templateId: string) {
        const template = await prisma.habitTemplate.findUnique({
            where: { id: templateId },
        });

        if (!template || template.userId !== userId) {
            return null;
        }

        return {
            ...template,
            defaultSchedule: this.safeJsonParse(template.defaultSchedule, {}),
            subvariableTemplate: this.safeJsonParse(template.subvariableTemplate, []),
        };
    }

    /**
     * Create a new template
     */
    static async createTemplate(userId: string, data: CreateTemplateInput) {
        const template = await prisma.habitTemplate.create({
            data: {
                userId,
                name: data.name,
                description: data.description,
                color: data.color || '#3b82f6',
                icon: data.icon || 'target',
                defaultSchedule: JSON.stringify(data.defaultSchedule || {}),
                subvariableTemplate: JSON.stringify(data.subvariableTemplate || []),
            },
        });

        return {
            ...template,
            defaultSchedule: this.safeJsonParse(template.defaultSchedule, {}),
            subvariableTemplate: this.safeJsonParse(template.subvariableTemplate, []),
        };
    }

    /**
     * Create a template from an existing habit
     */
    static async createTemplateFromHabit(userId: string, habitId: string) {
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
            throw new Error('Habit not found or access denied');
        }

        // Check if template with this name already exists
        const existingTemplate = await prisma.habitTemplate.findFirst({
            where: {
                userId,
                name: habit.name,
            },
        });

        if (existingTemplate) {
            throw new Error('Template with this name already exists');
        }

        // Map subvariables to template format
        const subvariableTemplate = habit.subvariables.map(sub => ({
            name: sub.name,
            type: sub.type,
            unit: sub.unit,
            metadata: this.safeJsonParse(sub.metadata, {}),
            order: sub.order,
        }));

        return this.createTemplate(userId, {
            name: habit.name,
            description: habit.description || undefined,
            color: habit.color,
            icon: habit.icon,
            defaultSchedule: this.safeJsonParse(habit.schedule, {}),
            subvariableTemplate,
        });
    }

    /**
     * Update a template
     */
    static async updateTemplate(userId: string, templateId: string, data: UpdateTemplateInput) {
        const existing = await prisma.habitTemplate.findUnique({
            where: { id: templateId },
        });

        if (!existing || existing.userId !== userId) {
            throw new Error('Template not found or access denied');
        }

        const updateData: Prisma.HabitTemplateUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.color !== undefined) updateData.color = data.color;
        if (data.icon !== undefined) updateData.icon = data.icon;
        if (data.defaultSchedule !== undefined) {
            updateData.defaultSchedule = JSON.stringify(data.defaultSchedule);
        }
        if (data.subvariableTemplate !== undefined) {
            updateData.subvariableTemplate = JSON.stringify(data.subvariableTemplate);
        }

        const template = await prisma.habitTemplate.update({
            where: { id: templateId },
            data: updateData,
        });

        return {
            ...template,
            defaultSchedule: this.safeJsonParse(template.defaultSchedule, {}),
            subvariableTemplate: this.safeJsonParse(template.subvariableTemplate, []),
        };
    }

    /**
     * Delete a template
     */
    static async deleteTemplate(userId: string, templateId: string) {
        const existing = await prisma.habitTemplate.findUnique({
            where: { id: templateId },
        });

        if (!existing || existing.userId !== userId) {
            throw new Error('Template not found or access denied');
        }

        await prisma.habitTemplate.delete({
            where: { id: templateId },
        });

        return { success: true };
    }

    /**
     * Record template usage (increment count and update last used)
     */
    static async recordTemplateUsage(templateId: string) {
        await prisma.habitTemplate.update({
            where: { id: templateId },
            data: {
                useCount: { increment: 1 },
                lastUsedAt: new Date(),
            },
        });
    }

    /**
     * Search templates by name (for autocomplete)
     */
    static async searchTemplates(userId: string, query: string, limit: number = 10) {
        const templates = await prisma.habitTemplate.findMany({
            where: {
                userId,
                name: {
                    contains: query,
                    mode: 'insensitive', // Works with PostgreSQL
                },
            },
            orderBy: [
                { useCount: 'desc' },
                { lastUsedAt: 'desc' },
            ],
            take: limit,
        });

        return templates.map(template => ({
            ...template,
            defaultSchedule: this.safeJsonParse(template.defaultSchedule, {}),
            subvariableTemplate: this.safeJsonParse(template.subvariableTemplate, []),
        }));
    }

    /**
     * Helper to safely parse JSON
     */
    private static safeJsonParse<T>(str: string, defaultValue: T): T {
        try {
            return JSON.parse(str) as T;
        } catch (e) {
            console.error('Failed to parse JSON:', e);
            return defaultValue;
        }
    }
}
