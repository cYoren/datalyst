import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

const parseDays = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

async function main() {
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

    console.log('Retention purge completed:', {
        runAt: now.toISOString(),
        deleted: {
            sessionLogs: sessionResult.count,
            userEvents: eventResult.count,
            insightsCache: insightsResult.count,
        },
    });
}

main()
    .catch((error) => {
        console.error('Retention purge failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
