import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';

/**
 * GET /api/habits/adhoc
 * Fetch all ADHOC schedule type habits for the current user
 */
export async function GET() {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const habits = await prisma.habit.findMany({
            where: {
                userId: user.id,
                archived: false,
                scheduleType: 'ADHOC',
            },
            select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                subvariables: {
                    where: { active: true },
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json(habits);
    } catch (error) {
        console.error('Error fetching ADHOC habits:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
