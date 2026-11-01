import { prisma } from '@/lib/prisma';

const safeParse = (value: string | null) => {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

/** Full account export. Shared by GET /api/user/export and the MCP export_data tool. */
export async function buildUserExport(userId: string) {
    const [
        profile,
        habits,
        entries,
        templates,
        experiments,
        sessionLogs,
        userEvents,
        insightsCache,
        aiUsage,
        studyMemberships,
        studyParticipation,
    ] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                onboardingCompleted: true,
                timezone: true,
                locale: true,
                theme: true,
                healthDataConsent: true,
                healthDataConsentAt: true,
                aiConsent: true,
                aiConsentAt: true,
                createdAt: true,
                updatedAt: true,
            },
        }),
        prisma.habit.findMany({
            where: { userId: userId },
            include: { subvariables: true },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.habitEntry.findMany({
            where: { userId: userId },
            include: { subvariableEntries: true },
            orderBy: { logicalDate: 'asc' },
        }),
        prisma.habitTemplate.findMany({
            where: { userId: userId },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.experiment.findMany({
            where: { userId: userId },
            include: { assignments: true, attestations: true },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.appSessionLog.findMany({
            where: { userId: userId },
            orderBy: { timestamp: 'asc' },
        }),
        prisma.userEvent.findMany({
            where: { userId: userId },
            orderBy: { timestamp: 'asc' },
        }),
        prisma.insightsCache.findUnique({
            where: { userId: userId },
        }),
        prisma.aiDailyUsage.findMany({
            where: { userId },
            select: { day: true, reservedUsd: true },
            orderBy: { day: 'asc' },
        }),
        prisma.studyMember.findMany({
            where: { userId },
            include: { study: { select: { id: true, name: true, status: true, protocol: true, protocolHash: true, createdAt: true, updatedAt: true } } },
        }),
        prisma.studyParticipant.findMany({
            where: { userId },
            include: { consent: true, study: { select: { id: true, name: true, status: true, protocol: true, protocolHash: true } } },
        }),
    ]);

    const normalizedHabits = habits.map(habit => ({
        ...habit,
        schedule: safeParse(habit.schedule as unknown as string),
        subvariables: habit.subvariables.map(sub => ({
            ...sub,
            metadata: safeParse(sub.metadata),
        })),
    }));

    const normalizedTemplates = templates.map(template => ({
        ...template,
        defaultSchedule: safeParse(template.defaultSchedule),
        subvariableTemplate: safeParse(template.subvariableTemplate),
    }));

    const normalizedEvents = userEvents.map(event => ({
        ...event,
        metadata: safeParse(event.metadata),
    }));

    return {
        exportedAt: new Date().toISOString(),
        user: profile,
        habits: normalizedHabits,
        entries,
        templates: normalizedTemplates,
        experiments,
        sessionLogs,
        userEvents: normalizedEvents,
        insightsCache,
        aiUsage,
        studyMemberships,
        studyParticipation,
    };
}
