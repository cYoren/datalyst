/**
 * One calendar day, written and read the same way everywhere.
 *
 * `HabitEntry.logicalDate` is a timestamp, not a date, so something has to decide which moment
 * counts as "the day". Two things went wrong when nothing did:
 *
 * - a server east of UTC stored the day at *its* local midnight, which reads back as the day
 *   before when the query bounds are UTC (`ROADMAP.md` S2 review);
 * - an app writing a measured value was refused its own local day in Sydney or Auckland for the
 *   hours when UTC has not rolled over yet.
 *
 * The rules now: **write** the day as UTC midnight; **read** with a window wide enough for rows
 * written before this rule (a legacy row sits within ±14 h of UTC midnight) and match on the
 * calendar day in either form; **bound** writes by the person's own time zone, not UTC.
 */

/** The canonical moment for a calendar day: midnight UTC. */
export function utcMidnight(day: string): Date {
    return new Date(`${day}T00:00:00.000Z`);
}

/** Anything that can stand for a stored day: a Date from the row, or a string from a fixture. */
export type StoredDay = Date | string | null | undefined;

function asDate(when: StoredDay): Date | null {
    if (when instanceof Date) return Number.isNaN(when.getTime()) ? null : when;
    if (typeof when === 'string') {
        const parsed = new Date(when.length === 10 ? `${when}T00:00:00.000Z` : when);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

/** The UTC calendar day of a stored timestamp, or null when it cannot be read. */
export function dayKeyUtc(when: StoredDay): string | null {
    const date = asDate(when);
    return date ? date.toISOString().slice(0, 10) : null;
}

/** The calendar day as the *server's* clock saw it — what a pre-fix row was stored with. */
export function dayKeyServerLocal(when: StoredDay): string | null {
    const date = asDate(when);
    if (!date) return null;
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * True when a stored timestamp is this calendar day, under either convention.
 *
 * An unreadable value answers `true`: a row that cannot be judged must not be silently dropped,
 * because a dropped row is a wrong answer while an extra one is filtered by the caller anyway.
 */
export function isLogicalDay(when: StoredDay, day: string): boolean {
    const utc = dayKeyUtc(when);
    if (utc === null) return true;
    return utc === day || dayKeyServerLocal(when) === day;
}

/**
 * A query window that contains every timestamp that could mean `day`: a day of slack either
 * side, then `isLogicalDay` narrows it. Wide on purpose — a missed row is a wrong answer, a
 * row discarded by the filter is not.
 */
export function logicalDayWindow(day: string): { gte: Date; lt: Date } {
    const start = utcMidnight(day).getTime();
    return { gte: new Date(start - 86_400_000), lt: new Date(start + 2 * 86_400_000) };
}

/** Inclusive window covering a `from`–`to` day range with the same slack. */
export function logicalRangeWindow(from: string, to: string): { gte: Date; lt: Date } {
    const start = utcMidnight(from).getTime();
    const end = utcMidnight(to).getTime();
    return { gte: new Date(start - 86_400_000), lt: new Date(end + 2 * 86_400_000) };
}

/** True when `when` falls in the `from`–`to` day range under either convention. */
export function isLogicalRange(when: StoredDay, from: string, to: string): boolean {
    const utc = dayKeyUtc(when);
    if (utc === null) return true;
    const local = dayKeyServerLocal(when)!;
    return (utc >= from && utc <= to) || (local >= from && local <= to);
}

/**
 * Today, in the person's own time zone.
 *
 * This is the ceiling for a write from an app the person is using: at 09:00 in Sydney the UTC
 * day is still yesterday, and a value for *their* today must be accepted.
 */
export function localDayIn(timeZone: string | null | undefined, when: Date = new Date()): string {
    if (timeZone) {
        try {
            // en-CA formats as YYYY-MM-DD, which is the calendar day in that zone.
            return new Intl.DateTimeFormat('en-CA', {
                year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
            }).format(when);
        } catch {
            // An unknown zone falls through to UTC rather than failing the write.
        }
    }
    // `when` is always a Date here, so the key is never null.
    return dayKeyUtc(when) ?? new Date(when).toISOString().slice(0, 10);
}

/** A day `days` before the given one, as a plain calendar calculation. */
export function shiftDay(day: string, days: number): string {
    return new Date(utcMidnight(day).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
