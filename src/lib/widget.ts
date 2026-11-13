'use client';

import { createClient } from '@/lib/supabase/client';
import type { WidgetNext } from '@/lib/widget-next';

interface WidgetPlugin {
    update(data: Record<string, unknown>): Promise<void>;
    hasToken(): Promise<{ hasToken: boolean }>;
}

/**
 * Home screen widget feed, native only. The shells register a tiny
 * DatalystWidget plugin that stores today's progress where the widget can read
 * it (App Group on iOS, SharedPreferences on Android) and refreshes it. The
 * widget treats data from another day as "not started", so no midnight sync is
 * needed here.
 */

/** The device key is issued once per install and whenever the shell loses it. */
async function widgetToken(): Promise<string | undefined> {
    try {
        const res = await fetch('/api/widget/token', { method: 'POST' });
        if (!res.ok) return undefined;
        const { token } = (await res.json()) as { token?: string };
        return token;
    } catch {
        return undefined;
    }
}

/**
 * `date` is the day the summary is for, so a late response for yesterday shows as stale.
 * `next` is the check-in the widget names, and the only one it may log by itself.
 */
export function syncWidget(date: string, logged: number, total: number, next: WidgetNext | null): Promise<void> {
    return push(date, logged, total, next);
}

/** Sign-out: no date tells the widget there is no account to show. */
export function clearWidget(): Promise<void> {
    return push('', 0, 0, null);
}

async function push(date: string, logged: number, total: number, next: WidgetNext | null): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core');
        // Builds shipped before the widget still load this site.
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('DatalystWidget')) return;

        const widget = registerPlugin<WidgetPlugin>('DatalystWidget');

        if (date) {
            // A response that lands after sign-out must not refill the cleared widget. Every
            // sync is a chance to notice a session that ended without the sign-out button
            // (expired refresh token, another tab), so clear instead of returning.
            const { data } = await createClient().auth.getSession();
            if (!data.session) {
                await widget.update({ date: '', logged: 0, total: 0 });
                return;
            }
        }

        // The shell keeps the key; asking keeps the hand-off to one extra call per install.
        // A shell built before `hasToken` existed has no such method and throws, and it also
        // cannot store a key, so there is nothing to mint. This must not stop the update:
        // the widget would freeze on its last numbers and sign-out would stop clearing it.
        let token: string | undefined;
        try {
            const { hasToken } = await widget.hasToken();
            if (!hasToken) token = await widgetToken();
        } catch {
            /* pre-key shell: no method, no key, nothing to do */
        }

        await widget.update({
            date,
            logged,
            total,
            next: next?.name ?? '',
            nextId: next?.subvariableId ?? '',
            habitId: next?.habitId ?? '',
            canLog: Boolean(next?.canLog),
            origin: window.location.origin,
            ...(token ? { token } : {}),
        });
    } catch {
        /* the widget keeps its last state */
    }
}
