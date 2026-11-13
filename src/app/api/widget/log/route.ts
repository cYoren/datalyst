import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authenticateWidget } from '@/lib/widget-auth';
import { isWidgetDayAllowed, nextCheckIn } from '@/lib/widget-next';
import { ScheduleType } from '@prisma/client';
import { appendRateLimitHeaders, checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';
import { EntryService } from '@/services/entry.service';
import { getTodayLog } from '@/services/today.service';
import { ServiceError } from '@/lib/error-utils';

export const dynamic = 'force-dynamic';

const logSchema = z.object({
    habitId: z.string().min(1),
    subvariableId: z.string().min(1),
    date: z.iso.date(),
});

/**
 * POST /api/widget/log
 * One tap from the home screen widget: records "yes" for a yes/no check-in and answers with
 * the fresh day, so the widget re-renders without a second request. Bearer widget key only,
 * only for the key owner's own variables, only for today, and never for the check-in an
 * active experiment controls.
 */
export async function POST(request: Request) {
    const agent = await authenticateWidget(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Charged before validation: a key that can write check-ins must not be free to hammer
    // the route, and the limit is the one stored on the key.
    const rateLimit = checkAgentRateLimit(`widget:${agent.apiKeyId}:log`, agent.rateLimitPerMinute);
    if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
    const limited = <T extends NextResponse>(response: T) => appendRateLimitHeaders(response, rateLimit);

    try {
        const parsed = logSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return limited(NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 }));
        }
        const { habitId, subvariableId, date } = parsed.data;

        // The widget may only write "yes" for a yes/no variable of the key's owner; every
        // other type needs the app, where the value can be chosen.
        const subvariable = await prisma.subvariable.findFirst({
            where: { id: subvariableId, habitId, active: true, habit: { userId: agent.userId, archived: false } },
            select: {
                type: true,
                habit: { select: { scheduleType: true, scheduleDays: true, user: { select: { timezone: true } } } },
            },
        });
        if (!subvariable) return limited(NextResponse.json({ error: 'Not found' }, { status: 404 }));
        if (subvariable.type !== 'BOOLEAN') {
            return limited(NextResponse.json({ error: 'Only yes/no check-ins can be logged from the widget' }, { status: 400 }));
        }

        // The widget only ever shows one day, so a write for another is a stale widget (open
        // the app) or a leaked key filling history. Both fail closed.
        if (!isWidgetDayAllowed(date, subvariable.habit.user.timezone ?? 'UTC')) {
            return limited(NextResponse.json({ error: 'That day is not today' }, { status: 400 }));
        }

        // Only what the check-in list itself offers. `getTodayLog` drops ad-hoc trackers and
        // weekly ones whose day is not today; without the same rule a key could write an
        // entry the product then hides, which is a write nobody can see or correct.
        const { scheduleType, scheduleDays } = subvariable.habit;
        if (scheduleType === ScheduleType.ADHOC) {
            return limited(NextResponse.json({ error: 'That check-in is not scheduled today' }, { status: 400 }));
        }
        if (scheduleType === ScheduleType.WEEKLY && scheduleDays.length > 0) {
            const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
            if (!scheduleDays.includes(weekday)) {
                return limited(NextResponse.json({ error: 'That check-in is not scheduled today' }, { status: 400 }));
            }
        }

        // An active experiment assigns its own independent variable. The check-in list hides
        // it for that reason, so a widget tap must not write it either. Same date bounds as
        // `EntryService.quickEntry`, so an experiment that has ended does not block a tap.
        const experiment = await prisma.experiment.findFirst({
            where: {
                userId: agent.userId,
                status: 'ACTIVE',
                startDate: { lte: date },
                endDate: { gte: date },
            },
            select: { independentId: true },
        });
        if (experiment?.independentId === habitId) {
            return limited(NextResponse.json({ error: 'Your experiment sets this check-in' }, { status: 400 }));
        }

        await EntryService.quickEntry(agent.userId, {
            habitId,
            subvariableId,
            numericValue: 1,
            logicalDate: date,
        });

        const summary = await getTodayLog(agent.userId, date);
        return limited(NextResponse.json(
            { date: summary.date, logged: summary.logged, total: summary.total, next: nextCheckIn(summary.variables) },
            { status: 200, headers: { 'Cache-Control': 'no-store' } },
        ));
    } catch (error) {
        if (error instanceof ServiceError) {
            return limited(NextResponse.json({ error: error.message }, { status: error.status }));
        }
        console.error('Error logging from widget:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export function GET() {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
