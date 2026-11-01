import { addDays } from "date-fns";

export type ActivityIntensity = 0 | 1 | 2 | 3 | 4;

export interface ActivityScheduleHabit {
    id: string;
    scheduleType: "DAILY" | "WEEKLY" | "ADHOC";
    scheduleDays: number[];
    schedule: string | null;
}

export interface ActivityEntryLike {
    habitId: string;
    logicalDate: Date;
}

export interface ActivityDayRow {
    date: string;
    completedTrackers: number;
    scheduledTrackers: number;
    completionPct: number;
    entriesCount: number;
    intensity: ActivityIntensity;
}

function getDateParts(date: Date, timeZone: string): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";

    return { year, month, day };
}

export function formatDateKeyInTimeZone(
    date: Date,
    timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
    const { year, month, day } = getDateParts(date, timeZone);
    return `${year}-${month}-${day}`;
}

export function getDayOfWeekInTimeZone(
    date: Date,
    timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): number {
    const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
    }).format(date);

    switch (weekday) {
        case "Sun":
            return 0;
        case "Mon":
            return 1;
        case "Tue":
            return 2;
        case "Wed":
            return 3;
        case "Thu":
            return 4;
        case "Fri":
            return 5;
        case "Sat":
            return 6;
        default:
            return 0;
    }
}

export function parseActivityDays(raw: string | null): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 182;
    return Math.min(Math.max(Math.floor(parsed), 14), 366);
}

export function parseLegacyScheduleDays(scheduleRaw: string | null): number[] {
    if (!scheduleRaw) return [];

    try {
        const parsed = JSON.parse(scheduleRaw);
        if (Array.isArray(parsed?.daysOfWeek)) {
            return parsed.daysOfWeek.filter((day: unknown): day is number => Number.isInteger(day));
        }
    } catch {
        // Ignore invalid legacy schedule JSON
    }

    return [];
}

export function isHabitScheduledOnDate(
    habit: ActivityScheduleHabit,
    dayOfWeek: number
): boolean {
    if (habit.scheduleType === "ADHOC") return false;

    if (habit.scheduleType === "WEEKLY") {
        const explicitDays = Array.isArray(habit.scheduleDays) ? habit.scheduleDays : [];
        if (explicitDays.length > 0) return explicitDays.includes(dayOfWeek);

        const legacyDays = parseLegacyScheduleDays(habit.schedule);
        if (legacyDays.length > 0) return legacyDays.includes(dayOfWeek);

        return true;
    }

    return true;
}

export function calculateActivityIntensity(completionPct: number, entriesCount: number): ActivityIntensity {
    if (completionPct <= 0 && entriesCount <= 0) return 0;
    if (completionPct <= 24) return 1;
    if (completionPct <= 49) return 2;
    if (completionPct <= 79) return 3;
    return 4;
}

export function buildActivityDayRows({
    habits,
    entries,
    startDate,
    days,
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
    habits: ActivityScheduleHabit[];
    entries: ActivityEntryLike[];
    startDate: Date;
    days: number;
    timeZone?: string;
}): ActivityDayRow[] {
    const entriesCountByDate = new Map<string, number>();
    const completedHabitsByDate = new Map<string, Set<string>>();

    for (const entry of entries) {
        const key = formatDateKeyInTimeZone(new Date(entry.logicalDate), timeZone);
        entriesCountByDate.set(key, (entriesCountByDate.get(key) || 0) + 1);

        if (!completedHabitsByDate.has(key)) {
            completedHabitsByDate.set(key, new Set<string>());
        }
        completedHabitsByDate.get(key)!.add(entry.habitId);
    }

    const rows: ActivityDayRow[] = [];

    for (let i = 0; i < days; i++) {
        const currentDate = addDays(startDate, i);
        const dateKey = formatDateKeyInTimeZone(currentDate, timeZone);
        const dayOfWeek = getDayOfWeekInTimeZone(currentDate, timeZone);

        let scheduledTrackers = 0;
        let completedTrackers = 0;

        const completedSet = completedHabitsByDate.get(dateKey) || new Set<string>();

        for (const habit of habits) {
            const scheduled = isHabitScheduledOnDate(habit, dayOfWeek);
            if (!scheduled) continue;

            scheduledTrackers += 1;
            if (completedSet.has(habit.id)) {
                completedTrackers += 1;
            }
        }

        const entriesCount = entriesCountByDate.get(dateKey) || 0;
        const completionPct = scheduledTrackers > 0
            ? Math.round((completedTrackers / scheduledTrackers) * 100)
            : 0;

        rows.push({
            date: dateKey,
            completedTrackers,
            scheduledTrackers,
            completionPct,
            entriesCount,
            intensity: calculateActivityIntensity(completionPct, entriesCount),
        });
    }

    return rows;
}
