'use client';

/**
 * Check-ins made while the connection is down (the app is open, the phone
 * loses signal) are kept here and replayed when it comes back, instead of
 * being lost. Quick entries are an upsert per variable and date on the
 * server, so replaying one twice is harmless.
 *
 * Every queued check-in carries the account that wrote it. A queue is shared by
 * whatever accounts use this browser, and a replay runs under the session that is
 * signed in at that moment, so replaying another account's rows would write one
 * person's values into the other's record.
 */

const KEY = 'datalyst:pending-checkins-v1';

export type QueuedCheckIn = Record<string, unknown> & {
    logicalDate: string;
    subvariableId: string;
    /** The account that logged this check-in. Absent only in entries from older builds. */
    ownerId?: string;
};

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

function ofOwner(items: QueuedCheckIn[], ownerId: string): QueuedCheckIn[] {
    return items.filter((item) => item.ownerId === ownerId);
}

/** How many check-ins belong to this account. */
export function pendingCount(ownerId: string | undefined): number {
    if (typeof window === 'undefined' || !ownerId) return 0;
    return ofOwner(read(), ownerId).length;
}

/** Later saves of the same variable and day replace earlier ones, per account. */
export function enqueue(item: QueuedCheckIn, ownerId: string | undefined) {
    if (!ownerId) return; // nothing can be attributed, so nothing is queued
    write([
        ...read().filter((q) => !(q.subvariableId === item.subvariableId && q.logicalDate === item.logicalDate && q.ownerId === ownerId)),
        { ...item, ownerId },
    ]);
}

/** A thrown fetch (not an HTTP error status) means the request never reached us. */
export function isNetworkFailure(error: unknown): boolean {
    return error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

let flushing = false;

/**
 * Replays this account's queued check-ins in order. Returns how many were sent.
 *
 * Rows belonging to another account are dropped rather than sent: their session is
 * gone, and the only thing a replay could do is file them under the wrong person.
 */
export async function flush(post: (body: QueuedCheckIn) => Promise<Response>, ownerId: string | undefined): Promise<number> {
    if (flushing || !ownerId) return 0;
    flushing = true;
    // Drop other accounts' leftovers once, before the loop touches anything.
    const strangers = read().filter((item) => item.ownerId !== ownerId);
    if (strangers.length) write(read().filter((item) => item.ownerId === ownerId));

    let sent = 0;
    try {
        for (const item of ofOwner(read(), ownerId)) {
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
