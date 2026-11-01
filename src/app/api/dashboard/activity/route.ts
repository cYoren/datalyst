import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { startOfDay, subDays } from 'date-fns';
import { buildActivityDayRows, parseActivityDays } from '@/lib/activityUtils';

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const days = parseActivityDays(request.nextUrl.searchParams.get('days'));
        const today = startOfDay(new Date());
        const startDate = startOfDay(subDays(today, days - 1));

        const [habits, entries] = await Promise.all([
            prisma.habit.findMany({
                where: {
                    userId: user.id,
                    archived: false,
                },
                select: {
                    id: true,
                    scheduleType: true,
                    scheduleDays: true,
                    schedule: true,
                },
            }),
            prisma.habitEntry.findMany({
                where: {
                    userId: user.id,
                    logicalDate: {
                        gte: startDate,
                        lte: today,
                    },
                },
                select: {
                    habitId: true,
                    logicalDate: true,
                },
            }),
        ]);

        const dayRows = buildActivityDayRows({
            habits: habits.map((habit) => ({
                ...habit,
                scheduleType: habit.scheduleType as 'DAILY' | 'WEEKLY' | 'ADHOC',
                schedule: habit.schedule ?? null,
            })),
            entries,
            startDate,
            days,
        });

        return NextResponse.json({ days: dayRows });
    } catch (error) {
        console.error('Error fetching dashboard activity:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
