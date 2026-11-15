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
import { localDayIn } from '@/lib/logical-day';
import { isSummedVariable } from '@/lib/dailyChart';

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

/**
 * The data the first-week cards need (`ROADMAP.md` W4), in one read.
 *
 * Two trackers at most: the "main" one (most complete week, nearest to the person's first
 * tracker) and the one that shares the most logged days with it. Everything the card says is a
 * description of these rows — nothing here computes a correlation.
 */
export interface FirstWeekSource {
    firstLoggedOn: string | null;
    today: string;
    main: { name: string; unit: string | null; direction: 'HIGHER_BETTER' | 'LOWER_BETTER' | 'NEUTRAL' } | null;
    mainDays: { date: string; value: number | null }[];
    other: { name: string; unit: string | null } | null;
    otherDays: { date: string; value: number | null }[];
    loggedToday: boolean;
    answerCount: number;
    /** The local hour of today's first check-in as `HH:MM`, for the reminder offer (W5). */
    firstCheckInTime: string | null;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** `HH:MM` for a moment, in the account's time zone; UTC when the zone is unknown or invalid. */
export function clockIn(timeZone: string | null, when: Date): string {
    if (timeZone) {
        try {
            return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(when);
        } catch {
            // An unknown zone must not break the card; fall through to UTC.
        }
    }
    return when.toISOString().slice(11, 16);
}

export async function getFirstWeekSource(userId: string, today = new Date()): Promise<FirstWeekSource> {
    // The person's own calendar day. Using UTC here made day one disappear every evening west of
    // UTC and day three arrive a day early east of it (S4 review).
    const profileFirst = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, createdAt: true } });
    const timeZone = profileFirst?.timezone ?? null;
    const todayKey = localDayIn(timeZone, today);
    const windowStart = new Date(Date.parse(`${todayKey}T00:00:00Z`) - 6 * 86_400_000);

    const [firstEntry, habits, recent, todaysFirst] = await Promise.all([
        prisma.habitEntry.findFirst({
            // A day the person logged themselves. An Apple Health import from last month is not
            // day one: "Logged. Tomorrow at the same time?" would be addressed to nobody.
            where: { userId, source: null },
            orderBy: { logicalDate: 'asc' },
            select: { logicalDate: true },
        }),
        prisma.habit.findMany({
            where: { userId, archived: false },
            orderBy: { rank: 'asc' },
            select: {
                id: true, name: true,
                subvariables: {
                    orderBy: { order: 'asc' },
                    select: { id: true, name: true, unit: true, goalDirection: true },
                },
            },
        }),
        prisma.subvariableEntry.findMany({
            where: { habitEntry: { userId, logicalDate: { gte: windowStart } } },
            select: {
                numericValue: true,
                subvariable: { select: { id: true, name: true, unit: true, habitId: true, metadata: true } },
                habitEntry: { select: { logicalDate: true, habitId: true } },
            },
        }),
        prisma.habitEntry.findFirst({
            where: { userId, logicalDate: { gte: new Date(`${todayKey}T00:00:00Z`) } },
            orderBy: { timestamp: 'asc' },
            select: { timestamp: true },
        }),
    ]);

    if (!firstEntry) {
        return {
            firstLoggedOn: null, today: todayKey, main: null, mainDays: [], other: null, otherDays: [],
            loggedToday: false, answerCount: 0, firstCheckInTime: null,
        };
    }

    // One value per tracker per day: the first subvariable is the tracker's headline question.
    const headline = new Map(habits.map((habit) => [habit.id, habit.subvariables[0] ?? null]));
    const perTracker = new Map<string, Map<string, number>>();

    for (const row of recent) {
        const habitId = row.habitEntry.habitId;
        if (headline.get(habitId)?.id !== row.subvariable.id) continue;
        const days = perTracker.get(habitId) ?? new Map<string, number>();
        const date = isoDay(row.habitEntry.logicalDate);
        // Only a summed variable (doses, minutes) adds up. A 0–10 scale read twice in a day is
        // 6 and 4, not 10: the card describes one day, not a total.
        let metadata: { aggregation?: 'sum' } = {};
        try { metadata = JSON.parse(row.subvariable.metadata || '{}'); } catch { /* legacy metadata */ }
        const summed = isSummedVariable({ metadata });
        const previous = days.get(date);
        days.set(date, previous === undefined ? row.numericValue : summed ? previous + row.numericValue : previous);
        perTracker.set(habitId, days);
    }

    const ranked = habits
        .map((habit) => ({ habit, days: perTracker.get(habit.id) ?? new Map<string, number>() }))
        .sort((a, b) => b.days.size - a.days.size || habits.indexOf(a.habit) - habits.indexOf(b.habit));

    const mainHabit = ranked[0] ?? null;
    const daysFor = (days: Map<string, number>) => {
        const out: { date: string; value: number | null }[] = [];
        for (let index = 0; index < 7; index += 1) {
            const date = isoDay(new Date(windowStart.getTime() + index * 86_400_000));
            out.push({ date, value: days.get(date) ?? null });
        }
        return out;
    };

    // The offer is the hour the person experienced, not the UTC hour behind it.
    const loggedHour = todaysFirst ? clockIn(timeZone, todaysFirst.timestamp) : null;
    const otherHabit = ranked.find((candidate) => candidate.habit.id !== mainHabit?.habit.id && candidate.days.size > 0);
    const todayAnswers = mainHabit?.days.has(todayKey) ? 1 : 0;

    return {
        firstLoggedOn: isoDay(firstEntry.logicalDate),
        today: todayKey,
        main: mainHabit
            ? {
                  name: mainHabit.habit.subvariables[0]?.name ?? mainHabit.habit.name,
                  unit: mainHabit.habit.subvariables[0]?.unit ?? null,
                  direction: mainHabit.habit.subvariables[0]?.goalDirection ?? 'NEUTRAL',
              }
            : null,
        mainDays: mainHabit ? daysFor(mainHabit.days) : [],
        other: otherHabit ? { name: otherHabit.habit.subvariables[0]?.name ?? otherHabit.habit.name, unit: otherHabit.habit.subvariables[0]?.unit ?? null } : null,
        otherDays: otherHabit ? daysFor(otherHabit.days) : [],
        loggedToday: todayAnswers > 0,
        answerCount: todayAnswers,
        firstCheckInTime: loggedHour,
    };
}
