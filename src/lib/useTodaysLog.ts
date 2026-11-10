'use client';

import useSWR, { mutate as mutateGlobal } from 'swr';
import { useCallback, useEffect, useState } from 'react';
import { enqueue, flush, isNetworkFailure, pendingCount, type QueuedCheckIn } from './offlineQueue';
import { useUser } from '@/lib/hooks';
import { formatLocalDateKey } from '@/lib/dateUtils';
import { recordCheckIn } from './reviewPrompt';
import { syncWidget } from './widget';

// Types for Today's Log - designed for easy React Native migration
export interface ActiveAssignment {
    experimentId: string;
    experimentName: string;
    condition: string;
    isWashout: boolean;
    conditionLabel?: string;
}

export interface TodayVariable {
    id: string;
    name: string;
    type: 'BOOLEAN' | 'NUMERIC' | 'SCALE_0_10' | 'CATEGORY';
    unit?: string;
    metadata?: {
        min?: number;
        max?: number;
        step?: number;
        labels?: string[];
        options?: string[];
    };
    habitId: string;
    habitName: string;
    habitIcon: string;
    habitColor: string;
    timeBlock: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME';
    rank: number;
    // Entry data for today (if exists)
    todayEntry?: {
        entryId: string;
        subvariableEntryId: string;
        numericValue: number;
        rawValue?: string;
    };
    // N=1 experiment integration
    activeAssignment?: ActiveAssignment | null;
    // Flag: if true, this variable is controlled by ProtocolCommandCenter (hide from TodaysLogWidget)
    isExperimentIndependent?: boolean;
}

export interface TodayLogSummary {
    date?: string; // the local day this summary is for
    variables: TodayVariable[];
    logged: number;
    total: number;
    percentage: number;
}

interface LogVariableOptions {
    rawValue?: string;
    followedAssignment?: boolean;
    logicalDate?: string;
    note?: string;
}

class RequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'RequestError';
        this.status = status;
    }
}

const isAuthError = (error: unknown): boolean =>
    error instanceof RequestError && error.status === 401;

// Fetcher for SWR
const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        // Deliberately no redirect here. This runs on a refresh interval, and
        // middleware bounces /login back to /dashboard whenever its own session
        // check passes — so navigating on 401 can ping-pong the app on a timer.
        // Surface the expiry instead and let the user re-authenticate.
        throw new RequestError(res.status, res.status === 401
            ? 'Your session expired. Sign in again to keep logging.'
            : `Failed to fetch: ${res.status}`);
    }
    return res.json();
};

/**
 * Hook for Today's Log Widget
 * Aggregates all active protocols' variables with today's log status
 * Designed for easy migration to React Native (pure logic, no web-specific deps)
 */
export function useTodaysLog() {
    const [authExpired, setAuthExpired] = useState(false);
    // Offline check-ins belong to an account: the queue is replayed under whoever
    // is signed in, so it must be filtered by the owner that wrote it.
    const { user } = useUser();
    const ownerId = user?.id;
    // Keyed by the device's local day: the server must not decide what "today" is,
    // and a new key after midnight fetches the new day.
    const todayKey = `/api/dashboard/today?date=${formatLocalDateKey(new Date())}`;
    const { data, error, isLoading, mutate } = useSWR<TodayLogSummary>(
        todayKey,
        fetcher,
        {
            revalidateOnFocus: !authExpired,  // Refresh when user returns
            // Stop polling once the session is gone; otherwise every tick
            // re-requests an endpoint that can only answer 401.
            refreshInterval: authExpired ? 0 : 60000,
            dedupingInterval: 30000,  // Dedupe requests for 30s
            keepPreviousData: true,   // Show cached data while revalidating
            shouldRetryOnError: (err) => !isAuthError(err),
            onError: (err) => {
                if (isAuthError(err)) setAuthExpired(true);
            },
            onSuccess: (summary) => {
                setAuthExpired(false);
                // Every real fetch (including the 60s poll) re-stamps the home
                // screen widget, so it follows midnight and never shows cache.
                if (summary.date) void syncWidget(summary.date, summary.logged, summary.total);
            },
        }
    );
    const [lastError, setLastError] = useState<string | null>(null);
    const [pending, setPending] = useState(0);

    const postQuick = useCallback((body: QueuedCheckIn) => fetch('/api/entries/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }), []);

    // Replay check-ins saved while offline: on load, and when the connection returns.
    useEffect(() => {
        const replay = async () => {
            setPending(pendingCount(ownerId));
            if (!pendingCount(ownerId)) return;
            if (await flush(postQuick, ownerId)) {
                void mutate();
                void mutateGlobal('/api/data');
            }
            setPending(pendingCount(ownerId));
        };
        void replay();
        window.addEventListener('online', replay);
        return () => window.removeEventListener('online', replay);
    }, [postQuick, mutate, ownerId]);

    const logVariable = async (
        habitId: string,
        subvariableId: string,
        numericValue: number,
        options: LogVariableOptions = {}
    ): Promise<boolean> => {
        const today = formatLocalDateKey(new Date());
        const logicalDate = options.logicalDate || today;
        const shouldApplyOptimistic = logicalDate === today;
        const rawValue = options.rawValue;

        setLastError(null);

        const parseErrorMessage = async (res: Response): Promise<string> => {
            try {
                const payload = await res.json();
                if (typeof payload?.error === 'string') return payload.error;
                if (Array.isArray(payload?.error) && payload.error.length > 0) return 'Invalid check-in value';
            } catch {
                // ignore parse errors
            }
            return 'Failed to save check-in';
        };

        let queued = false;
        const payload: QueuedCheckIn = {
            habitId,
            subvariableId,
            numericValue,
            rawValue,
            logicalDate,
            followedAssignment: options.followedAssignment,
            note: options.note,
        };
        // null means the network is down and the check-in was queued for later.
        const send = async (): Promise<Response | null> => {
            try {
                return await postQuick(payload);
            } catch (error) {
                if (!isNetworkFailure(error)) throw error;
                enqueue(payload, ownerId);
                setPending(pendingCount(ownerId));
                queued = true;
                return null;
            }
        };

        try {
            if (shouldApplyOptimistic) {
                const currentData = data || { variables: [], logged: 0, total: 0, percentage: 0 };
                const updatedVariables = currentData.variables.map((v: TodayVariable) => {
                    if (v.id === subvariableId) {
                        return {
                            ...v,
                            todayEntry: {
                                entryId: 'optimistic',
                                subvariableEntryId: 'optimistic',
                                numericValue,
                                rawValue
                            }
                        };
                    }
                    return v;
                });

                const newLogged = updatedVariables.filter(v => v.todayEntry).length;
                const total = updatedVariables.length;
                const optimisticData = {
                    ...currentData,
                    variables: updatedVariables,
                    logged: newLogged,
                    total,
                    percentage: total > 0 ? Math.round((newLogged / total) * 100) : 0
                };

                await mutate(
                    async () => {
                        const res = await send();
                        if (!res) return optimisticData; // queued offline, keep it shown as logged
                        if (!res.ok) {
                            throw new Error(await parseErrorMessage(res));
                        }

                        return await fetcher(todayKey);
                    },
                    {
                        optimisticData,
                        rollbackOnError: true,
                        revalidate: false,
                        populateCache: true
                    }
                );
            } else {
                const res = await send();
                if (res && !res.ok) {
                    throw new Error(await parseErrorMessage(res));
                }
                if (res) await mutate();
            }
        } catch (error) {
            console.error('Error logging variable:', error);
            setLastError(error instanceof Error ? error.message : 'Failed to save check-in');
            return false;
        }

        if (queued) return true;

        // The dashboard's today-vs-average card and the Data page read this.
        void mutateGlobal('/api/data');

        // Ask for a review only once the check-in is saved, so a prompt can
        // never sit in front of a failed write. Finishing every variable for
        // the day is the peak moment here and is worth an ask on its own; a
        // single logged variable stacks up with others first. Deduped by date
        // because the summary is revalidated on focus and on a timer.
        //
        // Fire and forget: a store prompt must never delay the UI, and the
        // service already swallows everything it can throw.
        void (async () => {
            const summary = await mutate();
            const total = summary?.total ?? 0;
            void recordCheckIn({
                dayComplete: total > 0 && (summary?.logged ?? 0) >= total,
                logicalDate,
            });
        })();

        return true;
    };

    return {
        summary: data || { variables: [], logged: 0, total: 0, percentage: 0 },
        isLoading,
        isError: !!error,
        // An expired session is the one fetch failure the user can act on, so it
        // rides the same banner the check-in errors use.
        lastError: lastError ?? (isAuthError(error) ? (error as Error).message : null),
        logVariable,
        pendingSync: pending,
        refresh: mutate,
        clearLastError: () => setLastError(null),
    };
}
