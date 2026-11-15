'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { readReminder, remindersSupported, setReminder, type ReminderSetting } from '@/lib/reminders';

/** True only where a local notification can actually be scheduled (the native app). */
export function useRemindersAvailable(): boolean {
    const [supported, setSupported] = useState(false);
    useEffect(() => { void remindersSupported().then(setSupported); }, []);
    return supported;
}

/**
 * Daily reminder switch + time. Renders nothing on web or on app builds without the plugin.
 *
 * `suggestedTime` is offered the moment the switch is turned on (`ROADMAP.md` W5): the reminder
 * makes sense at the hour the person actually checks in, not at a default they never chose.
 */
export function ReminderControl({ suggestedTime }: { suggestedTime?: string } = {}) {
    const [supported, setSupported] = useState(false);
    const [setting, setSetting] = useState<ReminderSetting>({ enabled: false, time: '20:00' });
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        void remindersSupported().then((ok) => {
            setSupported(ok);
            const stored = readReminder();
            // Only a reminder the person has not chosen yet takes the suggestion.
            const untouched = !window.localStorage.getItem('datalyst:reminder-v1');
            setSetting(untouched && suggestedTime ? { ...stored, time: suggestedTime } : stored);
        });
    }, [suggestedTime]);

    if (!supported) return null;

    const apply = async (next: ReminderSetting) => {
        setSetting(next);
        const ok = await setReminder(next);
        setDenied(next.enabled && !ok);
        if (!ok) setSetting({ ...next, enabled: false });
    };

    return (
        <div className="rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] p-4">
            <div className="flex items-center justify-between gap-3">
                <label htmlFor="reminder-toggle" className="flex items-center gap-3 text-sm font-medium text-[var(--text-primary)]">
                    <Bell className="h-4 w-4 text-[var(--color-accent)]" />
                    Daily check-in reminder
                </label>
                <input
                    id="reminder-toggle"
                    type="checkbox"
                    role="switch"
                    checked={setting.enabled}
                    onChange={(e) => void apply({ ...setting, enabled: e.target.checked })}
                    className="h-6 w-11 accent-[var(--color-accent)]"
                />
            </div>
            {setting.enabled && (
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                    <span>Remind me at</span>
                    <input
                        type="time"
                        value={setting.time}
                        onChange={(e) => e.target.value && void apply({ ...setting, time: e.target.value })}
                        className="h-11 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] px-3 text-base text-[var(--text-primary)]"
                    />
                </div>
            )}
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                {denied
                    ? 'Notifications are off for Datalyst. Turn them on in your phone settings.'
                    : 'Skipped on days you have already checked in.'}
            </p>
        </div>
    );
}
