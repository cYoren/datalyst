import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { getTodayLog } from '@/services/today.service';

/**
 * GET /api/dashboard/today
 * Returns all active variables with today's log status for the Today's Log widget.
 * ?date=YYYY-MM-DD is the device's local day.
 */
export async function GET(request: Request) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const requested = new URL(request.url).searchParams.get('date');
        return NextResponse.json(await getTodayLog(user.id, requested));
    } catch (error) {
        console.error('Error fetching today\'s log:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
