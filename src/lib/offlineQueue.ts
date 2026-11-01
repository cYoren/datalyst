'use client';

/**
 * Check-ins made while the connection is down (the app is open, the phone
 * loses signal) are kept here and replayed when it comes back, instead of
 * being lost. Quick entries are an upsert per variable and date on the
 * server, so replaying one twice is harmless.
 */

const KEY = 'datalyst:pending-checkins-v1';

export type QueuedCheckIn = Record<string, unknown> & { logicalDate: string; subvariableId: string };

function read(): QueuedCheckIn[] {
    try {
        return JSON.parse(window.localStorage.getItem(KEY) || '[]') as QueuedCheckIn[];
    } catch {
        return [];
    }
}

function write(items: QueuedCheckIn[]) {
    try {
        if (items.length) window.localStorage.setItem(KEY, JSON.stringify(items));
        else window.localStorage.removeItem(KEY);
    } catch {
        /* storage full or blocked: nothing more we can do offline */
    }
}

export function pendingCount(): number {
    return typeof window === 'undefined' ? 0 : read().length;
}

/** Later saves of the same variable and day replace earlier ones. */
export function enqueue(item: QueuedCheckIn) {
    write([...read().filter((q) => !(q.subvariableId === item.subvariableId && q.logicalDate === item.logicalDate)), item]);
}

/** A thrown fetch (not an HTTP error status) means the request never reached us. */
export function isNetworkFailure(error: unknown): boolean {
    return error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

let flushing = false;

/** Replays queued check-ins in order. Returns how many were sent. */
export async function flush(post: (body: QueuedCheckIn) => Promise<Response>): Promise<number> {
    if (flushing) return 0;
    flushing = true;
    let sent = 0;
    try {
        for (const item of read()) {
            let res: Response;
            try {
                res = await post(item);
            } catch {
                break; // still offline, keep the rest
            }
            // 4xx will never succeed (deleted tracker, expired session is 401 and
            // should wait for sign-in); drop only permanent rejections.
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429)) {
                // Remove exactly this item; a newer save of the same variable may have been queued meanwhile.
                const sentJson = JSON.stringify(item);
                write(read().filter((q) => JSON.stringify(q) !== sentJson));
                if (res.ok) sent++;
            } else {
                break;
            }
        }
    } finally {
        flushing = false;
    }
    return sent;
}
