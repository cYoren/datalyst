import { prisma } from '@/lib/prisma';


export class SessionService {
    /**
     * Logs a new app session
     */
    static async logSessionStart(userId: string, origin: string = 'web') {
        return await prisma.appSessionLog.create({
            data: {
                userId,
                origin,
                timestamp: new Date(),
            },
        });
    }

    /**
     * Logs a generic user event
     */
    static async logUserEvent(
        userId: string,
        eventType: 'HABIT_CREATED' | 'HABIT_UPDATED' | 'HABIT_DELETED' | 'ENTRY_CREATED' | 'ENTRY_UPDATED' | 'ENTRY_DELETED' | 'SUBVARIABLE_CREATED' | 'SUBVARIABLE_UPDATED',
        entityId?: string,
        metadata: Record<string, unknown> = {}
    ) {
        return await prisma.userEvent.create({
            data: {
                userId,
                eventType,
                entityId,
                metadata: JSON.stringify(metadata),
            },
        });
    }

    /**
     * Analyzes usage patterns to detect potential bias
     * e.g., user only logs on weekends, or late at night
     */
    static async getUsagePatterns(userId: string) {
        const logs = await prisma.appSessionLog.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: 100,
        });

        if (logs.length === 0) return null;

        const hourDistribution = new Array(24).fill(0);
        const dayDistribution = new Array(7).fill(0);

        logs.forEach(log => {
            const date = new Date(log.timestamp);
            hourDistribution[date.getHours()]++;
            dayDistribution[date.getDay()]++;
        });

        return {
            totalSessions: logs.length,
            lastSession: logs[0].timestamp,
            hourDistribution,
            dayDistribution,
        };
    }
}
