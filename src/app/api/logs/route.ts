import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';

export async function GET() {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [events, sessions] = await Promise.all([
            prisma.userEvent.findMany({
                where: { userId: user.id },
                take: 50,
                orderBy: { timestamp: 'desc' }
            }),
            prisma.appSessionLog.findMany({
                where: { userId: user.id },
                take: 50,
                orderBy: { timestamp: 'desc' }
            })
        ]);

        return NextResponse.json({ events, sessions });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
