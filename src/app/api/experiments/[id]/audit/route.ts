import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import {
    performN1Stats,
    performBlockAnalysis,
    testCarryoverEffect,
    testPeriodEffect,
    performMultiArmAnalysis,
    AuditReport,
} from '@/stats/analysis';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/experiments/[id]/audit
 * Generate a comprehensive audit report for transparency and reproducibility
 */
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Fetch experiment with full details
        const experiment = await prisma.experiment.findFirst({
            where: { id, userId: user.id },
            include: {
                independent: {
                    select: { name: true, icon: true },
                },
                dependent: {
                    select: {
                        name: true,
                        icon: true,
                        subvariables: {
                            where: { active: true },
                            take: 1,
                            select: { id: true },
                        },
                    },
                },
                assignments: {
                    orderBy: { date: 'asc' },
                },
            },
        });

        if (!experiment) {
            return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
        }

        // Only allow audit for completed experiments
        if (experiment.status === 'ACTIVE' || experiment.status === 'PLANNING') {
            return NextResponse.json({
                error: 'Audit not available',
                message: 'Audit reports can only be generated after an experiment is completed.',
            }, { status: 400 });
        }

        // Fetch dependent variable entries
        const dependentSubId = experiment.dependent.subvariables[0]?.id;
        if (!dependentSubId) {
            return NextResponse.json({ error: 'No outcome variable configured' }, { status: 400 });
        }

        const dependentEntries = await prisma.habitEntry.findMany({
            where: {
                habitId: experiment.dependentId,
                userId: user.id,
                logicalDate: {
                    gte: new Date(experiment.startDate),
                    lte: new Date(experiment.endDate),
                },
            },
            include: {
                subvariableEntries: {
                    where: { subvariableId: dependentSubId },
                },
            },
            orderBy: { logicalDate: 'asc' },
        });

        // Build assignment map
        const assignmentMap = new Map<string, { condition: string; isWashout: boolean }>();
        for (const a of experiment.assignments) {
            assignmentMap.set(a.date, { condition: a.condition, isWashout: a.isWashout });
        }

        // Build chart data and group by condition
        const chartData: { date: string; dependent: number | null; condition: string | null; isWashout: boolean }[] = [];
        const conditionGroups = new Map<string, number[]>();

        const startDate = new Date(experiment.startDate);
        const endDate = new Date(experiment.endDate);
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const entry = dependentEntries.find(e => e.logicalDate.toISOString().split('T')[0] === dateStr);
            const asgn = assignmentMap.get(dateStr);
            const depValue = entry?.subvariableEntries[0]?.numericValue ?? null;

            chartData.push({
                date: dateStr,
                dependent: depValue,
                condition: asgn?.condition ?? null,
                isWashout: asgn?.isWashout ?? false,
            });

            if (asgn && !asgn.isWashout && depValue !== null) {
                if (!conditionGroups.has(asgn.condition)) {
                    conditionGroups.set(asgn.condition, []);
                }
                conditionGroups.get(asgn.condition)!.push(depValue);
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Parse conditions
        let conditionLabels: string[] = ['A', 'B'];
        try {
            const raw = experiment.conditions;
            if (raw && typeof raw === 'string') {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length >= 2) {
                    conditionLabels = parsed.map((c: { label: string }) => c.label);
                }
            }
        } catch { /* use default */ }

        // Temporal values for autocorrelation
        const temporalValues = chartData
            .filter(d => !d.isWashout && d.dependent !== null)
            .map(d => d.dependent as number);

        // Perform analysis based on number of conditions
        const isMultiArm = conditionLabels.length > 2;
        let n1Results = null;
        let multiArmResults = null;

        if (isMultiArm) {
            multiArmResults = performMultiArmAnalysis(conditionGroups, undefined, temporalValues);
        } else {
            const condA = conditionGroups.get(conditionLabels[0]) ?? [];
            const condB = conditionGroups.get(conditionLabels[1]) ?? [];

            const isBlocked = experiment.randomizationType === 'BLOCKED';
            const blockAnalysis = isBlocked ? performBlockAnalysis(chartData, experiment.assignments) : null;
            const carryoverTest = isBlocked ? testCarryoverEffect(chartData, experiment.assignments) : null;
            const periodEffect = blockAnalysis ? testPeriodEffect(blockAnalysis.blockDifferences) : null;

            n1Results = performN1Stats(condA, condB, temporalValues, blockAnalysis, carryoverTest, periodEffect);
        }

        // Build audit report
        const auditReport: AuditReport & {
            multiArm?: typeof multiArmResults;
            conditionLabels: string[];
            dataPoints: number;
            complianceRate: number;
        } = {
            experimentName: experiment.name,
            hypothesis: experiment.hypothesis || '(No hypothesis specified)',
            hypothesisLockedAt: experiment.hypothesisLockedAt?.toISOString() ?? null,
            startDate: experiment.startDate,
            endDate: experiment.endDate,
            randomizationType: experiment.randomizationType,
            washoutPeriod: experiment.washoutPeriod,
            isBlind: experiment.isBlind,
            results: n1Results!,
            multiArm: multiArmResults ?? undefined,
            conditionLabels,
            bangIndex: null, // TODO: implement blinding collection
            covariateAdjustment: null,
            analysisModifiedAfterLock: false, // TODO: detect if analysis params changed
            generatedAt: new Date().toISOString(),
            dataPoints: temporalValues.length,
            complianceRate: Math.round((temporalValues.length / chartData.filter(d => !d.isWashout).length) * 100),
        };

        return NextResponse.json(auditReport);
    } catch (error) {
        console.error('Error generating audit report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
