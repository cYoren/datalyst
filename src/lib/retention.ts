import { prisma } from '@/lib/prisma';
// Kept in a module with no database behind it: Settings imports the same numbers, and a client
// component that pulled Prisma into the browser bundle failed the build (S4 review).
import { RETENTION_DAYS, parseDays } from '@/lib/retention-windows';

export { RETENTION_DAYS };

export async function purgeRetention() {
    const now = new Date();
    const sessionDays = RETENTION_DAYS.sessionLogs();
    const eventDays = RETENTION_DAYS.userEvents();
    const insightsDays = RETENTION_DAYS.insights();

    const sessionCutoff = new Date(now.getTime() - sessionDays * 24 * 60 * 60 * 1000);
    const eventCutoff = new Date(now.getTime() - eventDays * 24 * 60 * 60 * 1000);
    const insightsCutoff = new Date(now.getTime() - insightsDays * 24 * 60 * 60 * 1000);

    // Counters, key events and spent authorization codes are operational records; they age out
    // on the same schedule as usage events instead of growing forever (86k counter rows a day
    // at 60/min is not a record, it is a leak).
    const opsDays = parseDays(process.env.RETENTION_USER_EVENT_DAYS, 365);
    const opsCutoff = new Date(now.getTime() - opsDays * 24 * 60 * 60 * 1000);

    const [sessionResult, eventResult, insightsResult, usageResult, keyEventResult, codeResult] = await Promise.all([
        prisma.appSessionLog.deleteMany({
            where: { timestamp: { lt: sessionCutoff } },
        }),
        prisma.userEvent.deleteMany({
            where: { timestamp: { lt: eventCutoff } },
        }),
        prisma.insightsCache.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: now } },
                    { createdAt: { lt: insightsCutoff } },
                ],
            },
        }),
        prisma.apiKeyUsage.deleteMany({ where: { windowStart: { lt: opsCutoff } } }),
        prisma.apiKeyEvent.deleteMany({ where: { createdAt: { lt: opsCutoff } } }),
        prisma.connectCode.deleteMany({ where: { expiresAt: { lt: opsCutoff } } }),
    ]);

    return {
        runAt: now.toISOString(),
        cutoffs: {
            sessionLogs: sessionCutoff.toISOString(),
            userEvents: eventCutoff.toISOString(),
            insightsCache: insightsCutoff.toISOString(),
            counters: opsCutoff.toISOString(),
        },
        deleted: {
            sessionLogs: sessionResult.count,
            userEvents: eventResult.count,
            insightsCache: insightsResult.count,
            rateLimitCounters: usageResult.count,
            keyEvents: keyEventResult.count,
            spentConnectCodes: codeResult.count,
        },
    };
}
