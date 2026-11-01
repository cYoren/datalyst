import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { completeExperiment, ExperimentLifecycleError } from '@/services/attestation.service';

/**
 * POST /api/experiments/log-compliance
 * 
 * Logs compliance for an active experiment's daily assignment.
 * This is the ONLY way to log the independent variable during an active trial.
 */
export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { experimentId, followedAssignment, numericValue, date } = body;

        if (!experimentId || typeof followedAssignment !== 'boolean' || typeof numericValue !== 'number') {
            return NextResponse.json(
                { error: 'Missing required fields: experimentId, followedAssignment, numericValue' },
                { status: 400 }
            );
        }

        // Verify the experiment exists and belongs to this user
        const experiment = await prisma.experiment.findFirst({
            where: {
                id: experimentId,
                userId: user.id,
                status: 'ACTIVE',
            },
            include: {
                independent: {
                    include: {
                        subvariables: {
                            where: { active: true },
                            take: 1, // Get the primary subvariable
                        },
                    },
                },
                assignments: {
                    where: { date },
                },
            },
        });

        if (!experiment) {
            return NextResponse.json(
                { error: 'Experiment not found or not active' },
                { status: 404 }
            );
        }

        const todayAssignment = experiment.assignments[0];
        if (!todayAssignment) {
            return NextResponse.json(
                { error: 'No assignment found for this date' },
                { status: 400 }
            );
        }

        const habit = experiment.independent;
        const subvariable = habit.subvariables[0];

        if (!subvariable) {
            return NextResponse.json(
                { error: 'No subvariable found for independent variable' },
                { status: 400 }
            );
        }

        // Parse logical date
        const logicalDate = new Date(`${date}T12:00:00Z`);

        // Check if entry already exists for today
        const existingEntry = await prisma.habitEntry.findFirst({
            where: {
                userId: user.id,
                habitId: habit.id,
                logicalDate: {
                    gte: new Date(`${date}T00:00:00Z`),
                    lt: new Date(`${date}T23:59:59Z`),
                },
            },
            include: {
                subvariableEntries: true,
            },
        });

        if (existingEntry) {
            // Update existing entry
            await prisma.habitEntry.update({
                where: { id: existingEntry.id },
                data: {
                    followedAssignment,
                    updatedAt: new Date(),
                },
            });

            // Update or create subvariable entry
            const existingSubEntry = existingEntry.subvariableEntries.find(
                (se) => se.subvariableId === subvariable.id
            );

            if (existingSubEntry) {
                await prisma.subvariableEntry.update({
                    where: { id: existingSubEntry.id },
                    data: {
                        numericValue,
                        rawValue: numericValue === 1 ? 'Yes' : 'No',
                    },
                });
            } else {
                await prisma.subvariableEntry.create({
                    data: {
                        habitEntryId: existingEntry.id,
                        subvariableId: subvariable.id,
                        numericValue,
                        rawValue: numericValue === 1 ? 'Yes' : 'No',
                    },
                });
            }

            return NextResponse.json({
                success: true,
                message: 'Compliance updated',
                entryId: existingEntry.id,
            });
        }

        // Create new entry
        const newEntry = await prisma.habitEntry.create({
            data: {
                userId: user.id,
                habitId: habit.id,
                logicalDate,
                followedAssignment,
                subvariableEntries: {
                    create: {
                        subvariableId: subvariable.id,
                        numericValue,
                        rawValue: numericValue === 1 ? 'Yes' : 'No',
                    },
                },
            },
        });

        // Check if experiment should auto-complete
        await checkAndCompleteExperiment(experiment.id, experiment.endDate);

        return NextResponse.json({
            success: true,
            message: 'Compliance logged',
            entryId: newEntry.id,
        });
    } catch (error) {
        console.error('Error logging compliance:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Checks if all assignments are logged and the experiment has ended.
 * If so, transitions to COMPLETED status.
 */
async function checkAndCompleteExperiment(experimentId: string, endDate: string) {
    const today = new Date();
    const end = new Date(endDate);

    // Only check if we're past the end date
    if (today < end) return;

    // Get all non-washout assignments
    const assignments = await prisma.assignment.findMany({
        where: {
            experimentId,
            isWashout: false,
        },
    });

    if (assignments.length === 0) return;

    // Get the experiment to find the independent habit
    const experiment = await prisma.experiment.findUnique({
        where: { id: experimentId },
        select: { independentId: true, userId: true },
    });

    if (!experiment) return;

    // Count logged entries for the independent variable
    const entries = await prisma.habitEntry.findMany({
        where: {
            userId: experiment.userId,
            habitId: experiment.independentId,
            logicalDate: {
                gte: new Date(`${assignments[0].date}T00:00:00Z`),
            },
        },
        select: {
            logicalDate: true,
        },
    });

    const loggedDates = new Set(
        entries.map((e) => e.logicalDate.toISOString().split('T')[0])
    );

    // Check if all assignment dates are logged
    const allLogged = assignments.every((a) => loggedDates.has(a.date));

    if (allLogged) {
        try { await completeExperiment(experimentId, experiment.userId); }
        catch (error) {
            // Legacy trials have no preregistration snapshot; never fabricate one.
            if (!(error instanceof ExperimentLifecycleError)) throw error;
        }
    }
}
