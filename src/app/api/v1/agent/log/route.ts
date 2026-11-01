/**
 * POST /api/v1/agent/log
 * 
 * Log data for an active trial.
 * Strictly validated against the protocol's expected schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAgent, forbiddenScopeResponse, hasScope, unauthorizedResponse } from '@/lib/agent-auth';
import { z } from 'zod';
import { appendRateLimitHeaders, checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';

const LogEntrySchema = z.object({
    trialId: z.string().min(1, 'trialId is required'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
    entries: z.array(z.object({
        subvariableId: z.string(),
        value: z.union([z.number(), z.boolean(), z.string()]),
    })).min(1, 'At least one entry is required'),
    note: z.string().optional(),
});

export async function POST(request: NextRequest) {
    // Authenticate the agent
    const agent = await authenticateAgent(request);
    if (!agent) {
        return unauthorizedResponse();
    }
    const logLimit = Math.min(agent.rateLimitPerMinute, 30);
    const rateLimit = checkAgentRateLimit(`agent:${agent.apiKeyId}:log`, logLimit);
    if (!rateLimit.allowed) {
        return rateLimitedResponse(rateLimit);
    }
    const withRateLimit = (response: NextResponse) => appendRateLimitHeaders(response, rateLimit);
    // Charged before the scope check so forbidden calls still count against the key's limit.
    if (!hasScope(agent, 'write')) {
        return appendRateLimitHeaders(forbiddenScopeResponse('write'), rateLimit);
    }

    try {
        const body = await request.json();
        const parsed = LogEntrySchema.safeParse(body);

        if (!parsed.success) {
            return withRateLimit(NextResponse.json(
                { success: false, error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            ));
        }

        const { trialId, date, entries, note } = parsed.data;

        // Verify the trial exists and belongs to the agent's user
        const experiment = await prisma.experiment.findFirst({
            where: {
                id: trialId,
                userId: agent.userId,
            },
            include: {
                independent: { include: { subvariables: true } },
                dependent: { include: { subvariables: true } },
            },
        });

        if (!experiment) {
            return withRateLimit(NextResponse.json(
                { success: false, error: `Trial not found: ${trialId}` },
                { status: 404 }
            ));
        }

        if (experiment.status !== 'ACTIVE') {
            return withRateLimit(NextResponse.json(
                { success: false, error: `Trial is not active (status: ${experiment.status})` },
                { status: 400 }
            ));
        }

        // Validate that all subvariableIds belong to this experiment
        const validSubvarIds = new Set([
            ...experiment.independent.subvariables.map(s => s.id),
            ...experiment.dependent.subvariables.map(s => s.id),
        ]);

        const invalidEntries = entries.filter(e => !validSubvarIds.has(e.subvariableId));
        if (invalidEntries.length > 0) {
            return withRateLimit(NextResponse.json(
                {
                    success: false,
                    error: 'Invalid subvariableId(s)',
                    invalidIds: invalidEntries.map(e => e.subvariableId),
                    validIds: Array.from(validSubvarIds),
                },
                { status: 400 }
            ));
        }

        // Group entries by habit
        const entriesByHabit = new Map<string, typeof entries>();

        for (const entry of entries) {
            // Find which habit this subvariable belongs to
            const isIndependent = experiment.independent.subvariables.some(s => s.id === entry.subvariableId);
            const habitId = isIndependent ? experiment.independentId : experiment.dependentId;

            if (!entriesByHabit.has(habitId)) {
                entriesByHabit.set(habitId, []);
            }
            entriesByHabit.get(habitId)!.push(entry);
        }

        // Create or update habit entries for each habit
        const logicalDate = new Date(date);
        const results: Array<{ habitId: string; entryId: string }> = [];

        for (const [habitId, habitEntries] of entriesByHabit) {
            // Check for existing entry on this date
            let habitEntry = await prisma.habitEntry.findFirst({
                where: {
                    habitId,
                    userId: agent.userId,
                    logicalDate: {
                        gte: new Date(date),
                        lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
                    },
                },
            });

            if (!habitEntry) {
                // Create new entry
                habitEntry = await prisma.habitEntry.create({
                    data: {
                        habitId,
                        userId: agent.userId,
                        logicalDate,
                        note,
                    },
                });
            }

            // Upsert subvariable entries
            for (const entry of habitEntries) {
                const numericValue = typeof entry.value === 'boolean'
                    ? (entry.value ? 1 : 0)
                    : typeof entry.value === 'number'
                        ? entry.value
                        : parseFloat(entry.value) || 0;

                await prisma.subvariableEntry.upsert({
                    where: {
                        habitEntryId_subvariableId: {
                            habitEntryId: habitEntry.id,
                            subvariableId: entry.subvariableId,
                        },
                    },
                    create: {
                        habitEntryId: habitEntry.id,
                        subvariableId: entry.subvariableId,
                        numericValue,
                        rawValue: String(entry.value),
                    },
                    update: {
                        numericValue,
                        rawValue: String(entry.value),
                    },
                });
            }

            results.push({ habitId, entryId: habitEntry.id });
        }

        return withRateLimit(NextResponse.json({
            success: true,
            logged: {
                trialId,
                date,
                entriesCount: entries.length,
                results,
            },
        }));
    } catch (error) {
        console.error('[Agent API] Failed to log entry:', error);
        return withRateLimit(NextResponse.json(
            { success: false, error: 'Failed to log entry' },
            { status: 500 }
        ));
    }
}
