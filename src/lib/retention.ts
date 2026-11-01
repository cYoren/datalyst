import { prisma } from '@/lib/prisma';

const parseDays = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export async function purgeRetention() {
    const now = new Date();
    const sessionDays = parseDays(process.env.RETENTION_SESSION_LOG_DAYS, 90);
    const eventDays = parseDays(process.env.RETENTION_USER_EVENT_DAYS, 365);
    const insightsDays = parseDays(process.env.RETENTION_INSIGHTS_DAYS, 30);

    const sessionCutoff = new Date(now.getTime() - sessionDays * 24 * 60 * 60 * 1000);
    const eventCutoff = new Date(now.getTime() - eventDays * 24 * 60 * 60 * 1000);
    const insightsCutoff = new Date(now.getTime() - insightsDays * 24 * 60 * 60 * 1000);

    const [sessionResult, eventResult, insightsResult] = await Promise.all([
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
    ]);

    return {
        runAt: now.toISOString(),
        cutoffs: {
            sessionLogs: sessionCutoff.toISOString(),
            userEvents: eventCutoff.toISOString(),
            insightsCache: insightsCutoff.toISOString(),
        },
        deleted: {
            sessionLogs: sessionResult.count,
            userEvents: eventResult.count,
            insightsCache: insightsResult.count,
        },
    };
}
