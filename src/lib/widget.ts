'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Home screen widget feed, native only. The shells register a tiny
 * DatalystWidget plugin that stores today's progress where the widget can read
 * it (App Group on iOS, SharedPreferences on Android) and refreshes it. The
 * widget treats data from another day as "not started", so no midnight sync is
 * needed here.
 */
/** `date` is the day the summary is for, so a late response for yesterday shows as stale. */
export function syncWidget(date: string, logged: number, total: number): Promise<void> {
    return push(date, logged, total);
}

/** Sign-out: no date tells the widget there is no account to show. */
export function clearWidget(): Promise<void> {
    return push('', 0, 0);
}

async function push(date: string, logged: number, total: number): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core');
        // Builds shipped before the widget still load this site.
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('DatalystWidget')) return;
        if (date) {
            // A response that lands after sign-out must not refill the cleared widget.
            const { data } = await createClient().auth.getSession();
            if (!data.session) return;
        }
        const widget = registerPlugin<{ update(data: { date: string; logged: number; total: number }): Promise<void> }>('DatalystWidget');
        await widget.update({ date, logged, total });
    } catch {
        /* the widget keeps its last state */
    }
}
