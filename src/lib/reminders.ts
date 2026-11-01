'use client';

/**
 * Daily check-in reminder, native only (local notifications, no server).
 *
 * Instead of one repeating notification we schedule the next REMINDER_DAYS
 * days individually, so a day that is already fully logged can be skipped and
 * a user who stops opening the app stops being nagged after two weeks.
 * syncReminder() is called whenever the check-in summary loads, which rolls
 * the window forward.
 *
 * The setting lives in localStorage: reminders are per device, like the
 * notifications themselves.
 */

const STORAGE_KEY = 'datalyst:reminder-v1';
const ID_BASE = 7000;
export const REMINDER_DAYS = 14;
export const DEFAULT_REMINDER_TIME = '20:00';

export interface ReminderSetting {
    enabled: boolean;
    time: string; // "HH:MM", device local time
}

export function readReminder(): ReminderSetting {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ReminderSetting;
    } catch {
        /* fall through to default */
    }
    return { enabled: false, time: DEFAULT_REMINDER_TIME };
}

function writeReminder(setting: ReminderSetting) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setting));
    } catch {
        /* the schedule still exists natively; losing the flag only hides it in Settings */
    }
}

/** Dates to fire on: the next `days` occurrences of `time`, skipping today when it is done or already past. */
export function reminderDates(now: Date, time: string, doneToday: boolean, days = REMINDER_DAYS): Date[] {
    const [hour, minute] = time.split(':').map(Number);
    const dates: Date[] = [];
    for (let offset = 0; dates.length < days; offset++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
        if (offset === 0 && (doneToday || at <= now)) continue;
        dates.push(at);
    }
    return dates;
}

async function plugin() {
    if (typeof window === 'undefined') return null;
    try {
        const { Capacitor } = await import('@capacitor/core');
        // Builds shipped before the plugin was added still load this site.
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LocalNotifications')) return null;
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        return LocalNotifications;
    } catch {
        return null;
    }
}

export async function remindersSupported(): Promise<boolean> {
    return (await plugin()) !== null;
}

async function schedule(setting: ReminderSetting, doneToday: boolean) {
    const ln = await plugin();
    if (!ln) return;
    const pending = await ln.getPending();
    const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 100);
    if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    if (!setting.enabled) return;

    await ln.schedule({
        notifications: reminderDates(new Date(), setting.time, doneToday).map((at, i) => ({
            id: ID_BASE + i,
            title: 'Time for your check-in',
            body: 'Under a minute. Every logged day sharpens your insights.',
            schedule: { at, allowWhileIdle: true },
            smallIcon: 'ic_stat_datalyst',
        })),
    });
}

/** Turn the reminder on or off. Returns false when the OS permission was refused. */
export async function setReminder(setting: ReminderSetting): Promise<boolean> {
    const ln = await plugin();
    if (!ln) return false;
    if (setting.enabled) {
        const { display } = await ln.requestPermissions();
        if (display !== 'granted') {
            writeReminder({ ...setting, enabled: false });
            return false;
        }
    }
    writeReminder(setting);
    await schedule(setting, false);
    return true;
}

/** Roll the schedule forward; skips today once every variable is logged. */
export async function syncReminder(doneToday: boolean): Promise<void> {
    const setting = readReminder();
    if (!setting.enabled) return;
    try {
        await schedule(setting, doneToday);
    } catch {
        /* a failed reschedule keeps the previous window, which is still valid */
    }
}
