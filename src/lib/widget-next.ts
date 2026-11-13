/**
 * The one check-in the widget names, shared by the web feed and the widget API so
 * both always point at the same variable.
 */

/** Scope of the device key a widget uses to log. Not in the user-selectable scope list. */
export const WIDGET_LOG_SCOPE = 'widget:log';

/** The `YYYY-MM-DD` a wall clock in `timezone` is on at `now`. */
export function userDayKey(now: Date, timezone: string): string {
    try {
        // en-CA formats as YYYY-MM-DD, which is the key every entry is stored under.
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(now);
    } catch {
        // An unknown timezone must not lock a user out of their own widget.
        return now.toISOString().slice(0, 10);
    }
}

/**
 * The widget only ever shows one day, so a tap may only write that day.
 *
 * Two days are accepted and no others: the user's own day (what the widget is showing) and
 * the server's UTC day. The second is not slack for a stale widget — it covers a user whose
 * stored timezone is missing or wrong, which must not lock them out of a check-in they can
 * see on screen. Yesterday and tomorrow in the user's own timezone are refused, which is
 * what "a stale widget opens the app instead" means.
 */
export function isWidgetDayAllowed(date: string, timezone: string, now: Date = new Date()): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    return date === userDayKey(now, timezone) || date === now.toISOString().slice(0, 10);
}

export interface WidgetNext {
    name: string;
    subvariableId: string;
    habitId: string;
    /** Only yes/no check-ins can be logged with one tap; anything else opens the app. */
    canLog: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/**
 * First scheduled variable without an entry today. Experiment-controlled ones are not
 * ours to fill. Takes `unknown[]` because the day summary is untyped at its source; the
 * fields are checked here rather than asserted at every call site.
 */
export function nextCheckIn(variables: readonly unknown[]): WidgetNext | null {
    for (const variable of variables) {
        const record = asRecord(variable);
        if (!record || record.todayEntry || record.isExperimentIndependent) continue;

        const id = text(record.id);
        const habitId = text(record.habitId);
        const name = text(record.name);
        if (!id || !habitId || !name) continue;

        return { name, subvariableId: id, habitId, canLog: record.type === 'BOOLEAN' };
    }
    return null;
}
