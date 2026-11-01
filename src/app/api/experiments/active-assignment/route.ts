import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { format } from 'date-fns';

/**
 * GET /api/experiments/active-assignment
 * Returns today's assignment for the user's currently active experiment
 */
export async function GET(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const serverDate = format(new Date(), 'yyyy-MM-dd');

        let today = serverDate;
        if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            const diffMs = Math.abs(
                new Date(dateParam + 'T12:00:00Z').getTime() -
                new Date(serverDate + 'T12:00:00Z').getTime()
            );
            if (diffMs <= 2 * 24 * 60 * 60 * 1000) {
                today = dateParam;
            }
        }

        // Find an active experiment for this user
        const activeExperiment = await prisma.experiment.findFirst({
            where: {
                userId: user.id,
                status: 'ACTIVE',
            },
            include: {
                independent: {
                    select: { name: true, icon: true, color: true }
                },
                dependent: {
                    select: { name: true, icon: true, color: true }
                },
                assignments: {
                    where: { date: today }
                }
            }
        });

        if (!activeExperiment) {
            return NextResponse.json({ message: 'No active experiment found' }, { status: 200 });
        }

        const todayAssignment = activeExperiment.assignments[0];

        // Parse condition labels
        let conditionLabels: string[] = ['A', 'B'];
        try {
            const raw = activeExperiment.conditions;
            if (raw && typeof raw === 'string') {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length >= 2) {
                    conditionLabels = parsed.map((c: { label: string }) => c.label);
                }
            }
        } catch { /* use default */ }

        // Check if user has already logged for today for the independent habit
        const todayLog = await prisma.habitEntry.findFirst({
            where: {
                userId: user.id,
                habitId: activeExperiment.independentId,
                logicalDate: {
                    gte: new Date(`${today}T00:00:00Z`),
                    lt: new Date(`${today}T23:59:59Z`), // Covers the logical day
                }
            }
        });

        return NextResponse.json({
            experiment: {
                id: activeExperiment.id,
                name: activeExperiment.name,
                type: activeExperiment.type,
                isBlind: activeExperiment.isBlind,
                independent: activeExperiment.independent,
                dependent: activeExperiment.dependent,
                startDate: activeExperiment.startDate,
                endDate: activeExperiment.endDate,
            },
            assignment: todayAssignment || null,
            hasLoggedToday: !!todayLog,
            conditionLabels,
            todayDate: today
        });
    } catch (error) {
        console.error('Error fetching active assignment:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
