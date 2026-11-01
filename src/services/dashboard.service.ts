import { prisma } from '@/lib/prisma';

interface ScheduleData {
    daysOfWeek?: number[];
    logLimit?: string;
}

function parseSchedule(schedule: unknown): ScheduleData {
    try {
        const parsed: unknown = typeof schedule === 'string' ? JSON.parse(schedule) : schedule;
        if (!parsed || typeof parsed !== 'object') return {};
        const value = parsed as Record<string, unknown>;
        return {
            daysOfWeek: Array.isArray(value.daysOfWeek)
                ? value.daysOfWeek.filter((day): day is number => typeof day === 'number')
                : undefined,
            logLimit: typeof value.logLimit === 'string' ? value.logLimit : undefined,
        };
    } catch {
        return {};
    }
}
import { differenceInDays, startOfDay, subDays, format } from 'date-fns';

export class DashboardService {
    /**
     * Calculate the current streak for a user
     * A streak is consecutive days with at least one habit entry
     */
    static async calculateUserStreak(userId: string): Promise<number> {
        const today = startOfDay(new Date());

        // Get all entries ordered by date descending
        const entries = await prisma.habitEntry.findMany({
            where: { userId, source: null }, // imported days are not check-ins
            select: { logicalDate: true },
            orderBy: { logicalDate: 'desc' },
            distinct: ['logicalDate'],
        });

        if (entries.length === 0) return 0;

        // Check if there's an entry for today or yesterday (grace period)
        const mostRecentDate = startOfDay(new Date(entries[0].logicalDate));
        const daysSinceLastEntry = differenceInDays(today, mostRecentDate);

        if (daysSinceLastEntry > 1) {
            // Streak is broken
            return 0;
        }

        // Count consecutive days
        let streak = 0;
        let expectedDate = mostRecentDate;

        for (const entry of entries) {
            const entryDate = startOfDay(new Date(entry.logicalDate));
            const diff = differenceInDays(expectedDate, entryDate);

            if (diff === 0) {
                streak++;
                expectedDate = subDays(expectedDate, 1);
            } else if (diff > 0) {
                // Gap found, streak ends
                break;
            }
        }

        return streak;
    }

    /**
     * Get completion rate for a specific period
     */
    static async getCompletionRate(userId: string, days: number = 7): Promise<number> {
        const startDate = startOfDay(subDays(new Date(), days - 1));
        const endDate = startOfDay(new Date());

        // Get all active habits
        const habits = await prisma.habit.findMany({
            where: { userId, archived: false, healthMetric: null }, // imported health trackers are not Check-in items
            select: { id: true, schedule: true },
        });

        if (habits.length === 0) return 0;

        // Get entries in the period
        const entries = await prisma.habitEntry.findMany({
            where: {
                userId,
                source: null,
                logicalDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                logicalDate: true,
                habitId: true,
            },
        });

        // Calculate expected vs actual entries
        let totalExpected = 0;
        let totalCompleted = 0;

        // Group entries by date and habit
        const entriesByDateAndHabit = new Map<string, Set<string>>();
        entries.forEach(entry => {
            const dateKey = format(new Date(entry.logicalDate), 'yyyy-MM-dd');
            if (!entriesByDateAndHabit.has(dateKey)) {
                entriesByDateAndHabit.set(dateKey, new Set());
            }
            entriesByDateAndHabit.get(dateKey)!.add(entry.habitId);
        });

        // For each day in the period
        for (let i = 0; i < days; i++) {
            const date = subDays(endDate, i);
            const dateKey = format(date, 'yyyy-MM-dd');
            const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

            // For each habit, check if it was scheduled for this day
            habits.forEach(habit => {
                const schedule = parseSchedule(habit.schedule);

                const daysOfWeek = schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]; // Default: all days

                if (daysOfWeek.includes(dayOfWeek)) {
                    totalExpected++;

                    if (entriesByDateAndHabit.get(dateKey)?.has(habit.id)) {
                        totalCompleted++;
                    }
                }
            });
        }

        return totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
    }

    /**
     * Get consistency score (weighted by recency)
     */
    static async getConsistencyScore(userId: string): Promise<number> {
        const days = 30;
        const startDate = startOfDay(subDays(new Date(), days - 1));

        const entries = await prisma.habitEntry.findMany({
            where: {
                userId,
                source: null,
                logicalDate: { gte: startDate },
            },
            select: { logicalDate: true },
            distinct: ['logicalDate'],
        });

        if (entries.length === 0) return 0;

        // Weight recent days more heavily
        let weightedScore = 0;
        let totalWeight = 0;

        for (let i = 0; i < days; i++) {
            const date = subDays(new Date(), i);
            const dateKey = format(date, 'yyyy-MM-dd');
            const weight = days - i; // More recent = higher weight

            const hasEntry = entries.some(e =>
                format(new Date(e.logicalDate), 'yyyy-MM-dd') === dateKey
            );

            if (hasEntry) {
                weightedScore += weight;
            }
            totalWeight += weight;
        }

        return Math.round((weightedScore / totalWeight) * 100);
    }

    /**
     * Get today's progress summary
     */
    static async getDailyProgress(userId: string) {
        const today = startOfDay(new Date());

        const habits = await prisma.habit.findMany({
            where: { userId, archived: false, healthMetric: null }, // imported health trackers are not Check-in items
            include: {
                entries: {
                    where: { logicalDate: today },
                }
            },
        });

        const todayDayOfWeek = today.getDay();

        const scheduledHabits = habits.filter(habit => {
            const schedule = parseSchedule(habit.schedule);

            const daysOfWeek = schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
            return daysOfWeek.includes(todayDayOfWeek);
        });

        const completed = scheduledHabits.filter(h => h.entries.length > 0).length;
        const total = scheduledHabits.length;

        return {
            completed,
            total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    }

    /**
     * Get weekly summary statistics
     */
    static async getWeeklySummary(userId: string) {
        const startDate = startOfDay(subDays(new Date(), 6));

        const entries = await prisma.habitEntry.findMany({
            where: {
                userId,
                source: null,
                logicalDate: { gte: startDate },
            },
            include: {
                subvariableEntries: true,
            },
        });

        const uniqueDays = new Set(
            entries.map(e => format(new Date(e.logicalDate), 'yyyy-MM-dd'))
        ).size;

        const totalEntries = entries.length;
        const avgEntriesPerDay = uniqueDays > 0 ? Math.round(totalEntries / uniqueDays) : 0;

        return {
            daysActive: uniqueDays,
            totalEntries,
            avgEntriesPerDay,
        };
    }

    /**
     * Get total unique logging days for the user (for insights countdown)
     */
    static async getTotalLoggingDays(userId: string): Promise<number> {
        const entries = await prisma.habitEntry.findMany({
            where: { userId, source: null }, // imported days are not check-ins
            select: { logicalDate: true },
        });

        return new Set(
            entries.map(e => format(new Date(e.logicalDate), 'yyyy-MM-dd'))
        ).size;
    }

    /**
     * Get habits scheduled for today
     */
    static async getTodayHabits(userId: string) {
        const today = startOfDay(new Date());
        const todayDayOfWeek = today.getDay();

        const habits = await prisma.habit.findMany({
            where: { userId, archived: false, healthMetric: null }, // imported health trackers are not Check-in items
            include: {
                subvariables: {
                    where: { active: true },
                    orderBy: { order: 'asc' },
                },
                entries: {
                    where: { logicalDate: today },
                },
            },
        });

        // Filter habits scheduled for today
        const scheduledHabits = habits.filter(habit => {
            const schedule = parseSchedule(habit.schedule);

            const daysOfWeek = schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
            return daysOfWeek.includes(todayDayOfWeek);
        });

        // Separate pending and completed
        const pending = scheduledHabits.filter(h => {
            const logLimit = this.getLogLimit(h.schedule);
            if (logLimit === 'unlimited') return true;
            return h.entries.length === 0;
        });

        const completed = scheduledHabits.filter(h => {
            const logLimit = this.getLogLimit(h.schedule);
            if (logLimit === 'unlimited') return false;
            return h.entries.length > 0;
        });

        return { pending, completed, all: scheduledHabits };
    }

    private static getLogLimit(schedule: unknown): string {
        return parseSchedule(schedule).logLimit || 'daily';
    }
}
