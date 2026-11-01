import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { InsightAvailabilityError } from '@/services/ai-insights.service';
import { parseQuickLog } from '@/services/quick-log.service';

/** POST /api/log/parse { text } → proposed values. Saving happens via /api/entries/quick after the user confirms. */
export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = z.object({ text: z.string().trim().min(2).max(500) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: 'Type what you want to log' }, { status: 400 });
    try {
        return NextResponse.json(await parseQuickLog(user.id, body.data.text));
    } catch (error) {
        if (error instanceof InsightAvailabilityError) return NextResponse.json({ state: error.state }, { status: error.status });
        console.error('Quick log parse failed:', error instanceof Error ? error.message : 'unknown');
        return NextResponse.json({ state: 'temporarily_unavailable' }, { status: 503 });
    }
}
