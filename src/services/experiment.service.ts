import { prisma } from '@/lib/prisma';
import { ServiceError } from '@/lib/error-utils';
import {
    performN1Stats,
    performBlockAnalysis,
    testCarryoverEffect,
    testPeriodEffect,
    calculateSequentialBoundary,
    calculateBayesianPosterior,
    performMultiArmAnalysis,
    interpretResults,
    generateBlockedSchedule,
} from '@/stats/analysis';
import type { ExperimentStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { experimentFormSchema } from '@/lib/validations';
import { updateExperimentWithLock } from '@/services/attestation.service';
import { hashExperimentData } from '@/lib/crypto/eas';

interface AssignmentRecord {
    date: string;
    condition: string;
    blockIndex: number;
    isWashout: boolean;
}

interface AnalysisParams {
    sequentialTesting?: { nLooks?: number };
}

interface ExperimentExtras {
    type: string;
    randomizationType: string;
    washoutPeriod: number;
    blockSize: number;
    isBlind: boolean;
    conditions: string;
    analysisParams?: string;
    assignments: AssignmentRecord[];
}

interface ChartDataPoint {
    date: string;
    independent: number | null;
    dependent: number | null;
    isWashout: boolean;
    condition: string | null;
}

export type ExperimentFormInput = z.infer<typeof experimentFormSchema>;

/** Lab experiments. Shared by the /api/experiments routes and the MCP tools. */
export async function listExperiments(userId: string, status?: ExperimentStatus | null) {
    const where: Prisma.ExperimentWhereInput = { userId: userId };
    if (status) {
        where.status = status as Prisma.ExperimentWhereInput['status'];
    }

    const experiments = await prisma.experiment.findMany({
        where,
        include: {
            independent: {
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    color: true,
                },
            },
            dependent: {
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    color: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return experiments;
}

/**
 * Creates an experiment from already validated input (experimentFormSchema) and,
 * for randomized designs, its blocked assignment schedule.
 */
export async function createExperiment(userId: string, data: ExperimentFormInput) {
    if (!['PLANNING', 'ACTIVE'].includes(data.status)) throw new ServiceError('New experiments must start in planning or active status', 400);
    const totalDays = Math.round((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 86_400_000) + 1;
    if (!Number.isFinite(totalDays) || totalDays < 8 || totalDays > 366) throw new ServiceError('Experiment duration must be 8 to 366 days', 400);

    // Verify both habits exist and belong to user
    const [independent, dependent] = await Promise.all([
        prisma.habit.findFirst({ where: { id: data.independentId, userId: userId, archived: false } }),
        prisma.habit.findFirst({ where: { id: data.dependentId, userId: userId, archived: false } }),
    ]);

    if (!independent) {
        throw new ServiceError('Independent variable not found', 404);
    }
    if (!dependent) {
        throw new ServiceError('Dependent variable not found', 404);
    }

    const experiment = await prisma.$transaction(async tx => {
        const created = await tx.experiment.create({
            data: {
                userId,
                name: data.name,
                hypothesis: data.hypothesis || null,
                independentId: data.independentId,
                dependentId: data.dependentId,
                startDate: data.startDate,
                endDate: data.endDate,
                status: 'PLANNING',
                type: data.type,
                randomizationType: data.randomizationType,
                washoutPeriod: data.washoutPeriod,
                blockSize: data.blockSize,
                isBlind: data.isBlind,
                conditions: JSON.stringify(data.conditions),
            },
            include: {
                independent: { select: { id: true, name: true, icon: true, color: true } },
                dependent: { select: { id: true, name: true, icon: true, color: true } },
            },
        });

        if (data.type === 'RANDOMIZED' || data.type === 'BLIND_RCT') {
            const conditionLabels = data.conditions.map(c => c.label);
            const schedule = generateBlockedSchedule(data.startDate, totalDays, data.blockSize, data.washoutPeriod, undefined, conditionLabels);
            await tx.assignment.createMany({ data: schedule.assignments.map(a => ({
                experimentId: created.id, date: a.date, condition: a.condition, blockIndex: a.blockIndex, isWashout: a.isWashout,
            })) });
        }
        return created;
    });
    return data.status === 'ACTIVE' ? updateExperimentWithLock(experiment.id, userId, { status: 'ACTIVE' }) : experiment;
}

/**
 * Experiment results from the stats engine. Inferential stats stay gated while
 * the experiment is ACTIVE to prevent peeking bias.
 */
export async function getExperimentResults(userId: string, id: string) {

    // Fetch experiment with variable details
    const experiment = await prisma.experiment.findFirst({
        where: { id, userId: userId },
        include: {
            independent: {
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    subvariables: {
                        where: { active: true },
                        take: 1,
                        select: { id: true, name: true, unit: true, type: true },
                    },
                },
            },
            dependent: {
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    subvariables: {
                        where: { active: true },
                        take: 1,
                        select: { id: true, name: true, unit: true, type: true },
                    },
                },
            },
            assignments: {
                orderBy: { date: 'asc' },
            },
            attestations: { select: { kind: true, snapshot: true, dataHash: true } },
        },
    });

    if (!experiment) {
        throw new ServiceError('Experiment not found', 404);
    }

    const experimentDetails = { ...experiment } as Omit<NonNullable<typeof experiment>, 'assignments'> & ExperimentExtras;
    type FrozenVariable = { name: string; icon: string; subvariable: { id: string; name: string; type: string; unit: string | null } | null };
    type FrozenPlan = { assignments: AssignmentRecord[]; variables?: { independent: FrozenVariable; dependent: FrozenVariable } };
    type FrozenResults = { observations: { date: string; value: number }[]; independentObservations?: { date: string; value: number }[] };
    const finished = experiment.status === 'COMPLETED' || experiment.status === 'ARCHIVED';
    const resultRecord = finished ? experiment.attestations?.find(r => r.kind === 'RESULTS') : undefined;
    const planRecord = resultRecord ? experiment.attestations?.find(r => r.kind === 'PREREG') : undefined;
    for (const record of [planRecord, resultRecord]) {
        if (record && hashExperimentData(record.snapshot) !== record.dataHash) throw new ServiceError('Frozen research record failed its integrity check', 409);
    }
    const frozen = resultRecord?.snapshot as FrozenResults | undefined;
    const plan = planRecord?.snapshot as FrozenPlan | undefined;
    if (plan) experimentDetails.assignments = plan.assignments;
    const independentSub = plan?.variables?.independent.subvariable ?? experiment.independent.subvariables[0];
    const dependentSub = plan?.variables?.dependent.subvariable ?? experiment.dependent.subvariables[0];

    if (!independentSub || !dependentSub) {
        throw new ServiceError('Variables must have at least one subvariable', 400);
    }

    // Fetch entries for both variables within date range
    const [independentEntries, dependentEntries] = frozen ? [[], []] : await Promise.all([
        prisma.habitEntry.findMany({
            where: {
                habitId: experiment.independentId,
                userId: userId,
                logicalDate: {
                    gte: new Date(experiment.startDate),
                    lt: new Date(new Date(`${experiment.endDate}T00:00:00Z`).getTime() + 86_400_000),
                },
            },
            include: {
                subvariableEntries: {
                    where: { subvariableId: independentSub.id },
                },
            },
            orderBy: { logicalDate: 'asc' },
        }),
        prisma.habitEntry.findMany({
            where: {
                habitId: experiment.dependentId,
                userId: userId,
                logicalDate: {
                    gte: new Date(experiment.startDate),
                    lt: new Date(new Date(`${experiment.endDate}T00:00:00Z`).getTime() + 86_400_000),
                },
            },
            include: {
                subvariableEntries: {
                    where: { subvariableId: dependentSub.id },
                },
            },
            orderBy: { logicalDate: 'asc' },
        }),
    ]);

    // Build date-indexed maps
    const independentMap = new Map<string, number>();
    independentEntries.forEach(entry => {
        const dateStr = entry.logicalDate.toISOString().split('T')[0];
        const subEntry = entry.subvariableEntries[0];
        if (subEntry) {
            independentMap.set(dateStr, subEntry.numericValue);
        }
    });

    const dependentMap = new Map<string, number>();
    dependentEntries.forEach(entry => {
        const dateStr = entry.logicalDate.toISOString().split('T')[0];
        const subEntry = entry.subvariableEntries[0];
        if (subEntry) {
            dependentMap.set(dateStr, subEntry.numericValue);
        }
    });
    if (frozen) {
        for (const observation of frozen.independentObservations ?? []) independentMap.set(observation.date, observation.value);
        for (const observation of frozen.observations) dependentMap.set(observation.date, observation.value);
    }

    // Build chart data (all dates in range)
    const chartData: ChartDataPoint[] = [];
    const pairedValues: { x: number; y: number }[] = [];

    const startDate = new Date(experiment.startDate);
    const endDate = new Date(experiment.endDate);
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const indValue = independentMap.get(dateStr) ?? null;
        const depValue = dependentMap.get(dateStr) ?? null;

        // Find active assignment for this day (to identify washout vs A vs B)
        const assignment = experimentDetails.assignments.find((a) => a.date === dateStr);

        chartData.push({
            date: dateStr,
            independent: indValue,
            dependent: depValue,
            isWashout: assignment?.isWashout ?? false,
            condition: assignment?.condition ?? null,
        });

        // Only include in correlation if both values exist
        if (indValue !== null && depValue !== null) {
            pairedValues.push({ x: indValue, y: depValue });
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Parse conditions from experiment (backward compat: default to A/B)
    let parsedConditions: { label: string }[] = [{ label: 'A' }, { label: 'B' }];
    try {
        const raw = experimentDetails.conditions;
        if (raw && typeof raw === 'string') {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length >= 2) parsedConditions = parsed;
        }
    } catch { /* use default */ }
    const conditionLabels = parsedConditions.map(c => c.label);

    // Split data by condition for N=1 analysis
    const conditionGroups = new Map<string, number[]>();
    for (const label of conditionLabels) {
        conditionGroups.set(
            label,
            chartData
                .filter(d => d.condition === label && !d.isWashout && d.dependent !== null)
                .map(d => d.dependent as number)
        );
    }

    // For backward compat: extract first two for existing 2-condition analysis
    const condA = conditionGroups.get(conditionLabels[0]) ?? [];
    const condB = conditionGroups.get(conditionLabels[1]) ?? [];

    // Build chronologically ordered dependent values (excluding washout) for autocorrelation
    const temporalValues = chartData
        .filter(d => !d.isWashout && d.dependent !== null)
        .map(d => d.dependent as number);

    // Block analysis (only for BLOCKED randomization)
    const isBlocked = experimentDetails.randomizationType === 'BLOCKED';
    const blockAnalysis = isBlocked
        ? performBlockAnalysis(chartData, experimentDetails.assignments)
        : null;

    // Carryover test (requires block assignments)
    const carryoverTest = isBlocked
        ? testCarryoverEffect(chartData, experimentDetails.assignments)
        : null;

    // Period effect test (requires block differences)
    const periodEffect = blockAnalysis
        ? testPeriodEffect(blockAnalysis.blockDifferences)
        : null;

    // Sequential testing for ACTIVE experiments
    let sequentialBoundary = null;
    if (experiment.status === 'ACTIVE' && condA.length >= 3 && condB.length >= 3) {
        const bayesian = calculateBayesianPosterior(condA, condB);
        if (bayesian) {
            const currentZ = bayesian.posteriorMean / bayesian.posteriorStd;
            let analysisParams: AnalysisParams | null = null;
            try {
                const raw = experimentDetails.analysisParams;
                if (raw && typeof raw === 'string') analysisParams = JSON.parse(raw);
            } catch { /* invalid JSON, use defaults */ }
            const totalLooks = analysisParams?.sequentialTesting?.nLooks ?? 5;
            // Estimate current look based on data fraction
            const totalPlannedDays = chartData.length;
            const currentDay = chartData.filter(d => d.dependent !== null).length;
            const dataFraction = Math.max(0.01, currentDay / Math.max(totalPlannedDays, 1));
            const currentLook = Math.max(1, Math.ceil(dataFraction * totalLooks));
            sequentialBoundary = calculateSequentialBoundary(currentZ, currentLook, totalLooks);
        }
    }

    // Perform advanced N=1 analysis (only for 2-condition experiments)
    const isMultiArm = conditionLabels.length > 2;
    const n1Stats = isMultiArm ? null : performN1Stats(condA, condB, temporalValues, blockAnalysis, carryoverTest, periodEffect, sequentialBoundary);

    // Multi-arm analysis (3+ conditions)
    let multiArmResults = null;
    if (isMultiArm) {
        // Parse doses if available
        const conditionDoses = new Map<string, number>();
        try {
            const raw = experimentDetails.conditions;
            if (raw && typeof raw === 'string') {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach((c: { label: string; dose?: number }) => {
                        if (c.dose !== undefined) {
                            conditionDoses.set(c.label, c.dose);
                        }
                    });
                }
            }
        } catch { /* no doses */ }

        multiArmResults = performMultiArmAnalysis(
            conditionGroups,
            conditionDoses.size > 0 ? conditionDoses : undefined,
            temporalValues
        );
    }

    // ========== RESULTS GATING ==========
    // For ACTIVE experiments, gate inferential statistics to prevent peeking bias
    if (experiment.status === 'ACTIVE') {
        const loggedDays = pairedValues.length;
        const totalDays = chartData.length;
        const complianceRate = totalDays > 0 ? Math.round((loggedDays / totalDays) * 100) : 0;

        return {
            gated: true,
            message: 'Results are locked until experiment completion. This prevents peeking bias which can invalidate N=1 studies.',
            experiment: {
                id: experiment.id,
                name: experiment.name,
                status: experiment.status,
                startDate: experiment.startDate,
                endDate: experiment.endDate,
            },
            progress: {
                totalDays,
                loggedDays,
                complianceRate,
                daysRemaining: Math.max(0, Math.ceil((new Date(experiment.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
            },
            // Only show sequential boundary if it allows stopping
            sequentialBoundary: sequentialBoundary?.canRejectNull || sequentialBoundary?.canStopForFutility
                ? sequentialBoundary
                : null,
        };
    }
    // ========== END RESULTS GATING ==========

    // Calculate Pearson correlation
    const correlation = calculatePearsonCorrelation(pairedValues);

    return {
        dataSource: frozen ? 'frozen' : 'live',
        experiment: {
            id: experiment.id,
            name: experiment.name,
            status: experiment.status,
            startDate: experiment.startDate,
            endDate: experiment.endDate,
            type: experimentDetails.type,
            isPublic: experiment.isPublic,
            slug: experiment.slug,
            randomizationType: experimentDetails.randomizationType,
            washoutPeriod: experimentDetails.washoutPeriod,
            blockSize: experimentDetails.blockSize,
            isBlind: experimentDetails.isBlind,
        },
        independent: {
            name: plan?.variables?.independent.name ?? experimentDetails.independent.name,
            icon: plan?.variables?.independent.icon ?? experimentDetails.independent.icon,
            variable: independentSub.name,
            unit: independentSub.unit || '',
        },
        dependent: {
            name: plan?.variables?.dependent.name ?? experimentDetails.dependent.name,
            icon: plan?.variables?.dependent.icon ?? experimentDetails.dependent.icon,
            variable: dependentSub.name,
            unit: dependentSub.unit || '',
        },
        chartData,
        stats: {
            totalDays: chartData.length,
            loggedDays: pairedValues.length,
            correlation: correlation,
            correlationType: 'pearson',
            strength: getCorrelationStrength(correlation),
            n1: n1Stats,
            multiArm: multiArmResults,
            conditionLabels,
            interpretation: interpretResults(
                n1Stats,
                multiArmResults,
                conditionLabels,
                experiment.dependent.name,
                experiment.independent.name,
                'HIGHER_BETTER' // TODO: get from habit goal direction
            ),
        },
    };
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculatePearsonCorrelation(pairs: { x: number; y: number }[]): number | null {
    if (pairs.length < 3) return null; // Need at least 3 data points

    const n = pairs.length;
    const sumX = pairs.reduce((acc, p) => acc + p.x, 0);
    const sumY = pairs.reduce((acc, p) => acc + p.y, 0);
    const sumXY = pairs.reduce((acc, p) => acc + p.x * p.y, 0);
    const sumX2 = pairs.reduce((acc, p) => acc + p.x * p.x, 0);
    const sumY2 = pairs.reduce((acc, p) => acc + p.y * p.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return null;

    const r = numerator / denominator;
    return Math.round(r * 100) / 100; // Round to 2 decimal places
}

/**
 * Get human-readable correlation strength
 */
function getCorrelationStrength(r: number | null): string {
    if (r === null) return 'insufficient data';
    const absR = Math.abs(r);
    if (absR >= 0.7) return r > 0 ? 'strong positive' : 'strong negative';
    if (absR >= 0.3) return r > 0 ? 'moderate positive' : 'moderate negative';
    return 'weak/none';
}
