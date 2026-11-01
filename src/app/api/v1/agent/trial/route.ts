/**
 * POST /api/v1/agent/trial
 * 
 * Start a new trial from a standardized protocol.
 * Agents use this to instantiate experiments for their users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAgent, forbiddenScopeResponse, hasScope, unauthorizedResponse } from '@/lib/agent-auth';
import { z } from 'zod';
import { generateBlockedSchedule } from '@/stats/analysis';
import { appendRateLimitHeaders, checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';
import { updateExperimentWithLock } from '@/services/attestation.service';

const StartTrialSchema = z.object({
    protocolId: z.string().min(1, 'protocolId is required'),
    // Duration in days (optional, defaults to protocol recommendation)
    duration: z.number().int().min(7).max(90).optional(),
    // Optional user identifier (for multi-tenant agents)
    externalUserId: z.string().optional(),
});

export async function POST(request: NextRequest) {
    // Authenticate the agent
    const agent = await authenticateAgent(request);
    if (!agent) {
        return unauthorizedResponse();
    }
    const rateLimit = checkAgentRateLimit(`agent:${agent.apiKeyId}:trial`, agent.rateLimitPerMinute);
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
        const parsed = StartTrialSchema.safeParse(body);

        if (!parsed.success) {
            return withRateLimit(NextResponse.json(
                { success: false, error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            ));
        }

        const { protocolId, duration } = parsed.data;

        // Fetch the protocol
        const protocol = await prisma.protocol.findUnique({
            where: { id: protocolId },
        });

        if (!protocol) {
            // Try by slug
            const protocolBySlug = await prisma.protocol.findUnique({
                where: { slug: protocolId },
            });

            if (!protocolBySlug) {
                return withRateLimit(NextResponse.json(
                    { success: false, error: `Protocol not found: ${protocolId}` },
                    { status: 404 }
                ));
            }
        }

        const resolvedProtocol = protocol || await prisma.protocol.findUnique({
            where: { slug: protocolId },
        });

        if (!resolvedProtocol) {
            return withRateLimit(NextResponse.json(
                { success: false, error: `Protocol not found: ${protocolId}` },
                { status: 404 }
            ));
        }

        // Calculate date range
        const trialDuration = duration || resolvedProtocol.recommendedDuration;
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + Math.max(0, trialDuration - 1));

        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        // Create the experiment
        // Note: For agent trials, we create placeholder habits based on the protocol templates
        // This is a simplified flow - in production you might want to reuse existing habits

        const independentTemplate = resolvedProtocol.independentTemplate as {
            name: string;
            type: string;
            unit?: string;
        };
        const dependentTemplate = resolvedProtocol.dependentTemplate as {
            name: string;
            type: string;
            unit?: string;
        };

        // Create habits for the trial
        const [independentHabit, dependentHabit] = await Promise.all([
            prisma.habit.create({
                data: {
                    userId: agent.userId,
                    name: independentTemplate.name,
                    icon: 'flask',
                    color: '#8b5cf6',
                    subvariables: {
                        create: {
                            name: independentTemplate.name,
                            type: independentTemplate.type === 'BOOLEAN' ? 'BOOLEAN' : 'SCALE_0_10',
                            unit: independentTemplate.unit,
                            order: 0,
                        },
                    },
                },
            }),
            prisma.habit.create({
                data: {
                    userId: agent.userId,
                    name: dependentTemplate.name,
                    icon: 'chart',
                    color: '#3b82f6',
                    subvariables: {
                        create: {
                            name: dependentTemplate.name,
                            type: dependentTemplate.type === 'BOOLEAN' ? 'BOOLEAN' : 'SCALE_0_10',
                            unit: dependentTemplate.unit,
                            order: 0,
                        },
                    },
                },
            }),
        ]);

        // Generate a unique slug for sharing
        const slug = `${resolvedProtocol.slug}-${Date.now().toString(36)}`;

        // Create the experiment
        const experiment = await prisma.experiment.create({
            data: {
                userId: agent.userId,
                name: resolvedProtocol.name,
                hypothesis: resolvedProtocol.description,
                protocolId: resolvedProtocol.id,
                independentId: independentHabit.id,
                dependentId: dependentHabit.id,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                type: 'RANDOMIZED',
                randomizationType: 'BLOCKED',
                washoutPeriod: resolvedProtocol.recommendedWashout,
                blockSize: 4,
                isBlind: false,
                status: 'PLANNING',
                slug,
                isPublic: false,
            },
            include: {
                independent: {
                    include: { subvariables: true },
                },
                dependent: {
                    include: { subvariables: true },
                },
            },
        });

        // Generate randomized assignments so results can split baseline/intervention correctly.
        const schedule = generateBlockedSchedule(
            formatDate(startDate),
            trialDuration,
            4,
            resolvedProtocol.recommendedWashout,
            undefined,
            ['A', 'B']
        );
        await prisma.assignment.createMany({
            data: schedule.assignments.map((assignment) => ({
                experimentId: experiment.id,
                date: assignment.date,
                condition: assignment.condition,
                blockIndex: assignment.blockIndex,
                isWashout: assignment.isWashout,
            })),
        });

        // Freeze and sign the completed plan only after assignments exist.
        await updateExperimentWithLock(experiment.id, agent.userId, { status: 'ACTIVE' });
        // Return the trial info with logging schema
        return withRateLimit(NextResponse.json({
            success: true,
            trial: {
                id: experiment.id,
                slug: experiment.slug,
                protocolId: resolvedProtocol.id,
                protocolSlug: resolvedProtocol.slug,
                startDate: experiment.startDate,
                endDate: experiment.endDate,
                status: 'ACTIVE',
            },
            loggingSchema: {
                independent: {
                    habitId: experiment.independentId,
                    subvariableId: experiment.independent.subvariables[0]?.id,
                    name: independentTemplate.name,
                    type: experiment.independent.subvariables[0]?.type,
                    unit: experiment.independent.subvariables[0]?.unit,
                },
                dependent: {
                    habitId: experiment.dependentId,
                    subvariableId: experiment.dependent.subvariables[0]?.id,
                    name: dependentTemplate.name,
                    type: experiment.dependent.subvariables[0]?.type,
                    unit: experiment.dependent.subvariables[0]?.unit,
                },
            },
            endpoints: {
                log: `/api/v1/agent/log`,
                results: `/api/v1/agent/results/${experiment.id}`,
            },
        }));
    } catch (error) {
        console.error('[Agent API] Failed to start trial:', error);
        return withRateLimit(NextResponse.json(
            { success: false, error: 'Failed to start trial' },
            { status: 500 }
        ));
    }
}
