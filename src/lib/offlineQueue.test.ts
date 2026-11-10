import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingCheckIns, enqueue, flush, pendingCount } from './offlineQueue';

const OWNER = 'user-a';
const OTHER = 'user-b';

const item = (subvariableId: string, value: number, logicalDate = '2026-09-24') =>
    ({ habitId: 'h', subvariableId, numericValue: value, logicalDate });

describe('offline check-in queue', () => {
    beforeEach(() => window.localStorage.clear());

    it('keeps only the latest value per variable and day', () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('a', 2), OWNER);
        enqueue(item('a', 3, '2026-09-23'), OWNER);
        expect(pendingCount(OWNER)).toBe(2);
    });

    it('replays in order and stops at the first network failure', async () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('b', 2), OWNER);
        const post = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 201 }))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'));
        expect(await flush(post, OWNER)).toBe(1);
        expect(pendingCount(OWNER)).toBe(1);
    });

    it('drops permanent rejections but keeps auth and server errors', async () => {
        enqueue(item('a', 1), OWNER);
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 401 })), OWNER);
        expect(pendingCount(OWNER)).toBe(1);
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 503 })), OWNER);
        expect(pendingCount(OWNER)).toBe(1);
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 404 })), OWNER);
        expect(pendingCount(OWNER)).toBe(0);
    });

    it('never replays check-ins of another account', async () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('b', 2), OTHER);

        const post = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
        // The other account signs in on this browser and the queue flushes.
        expect(await flush(post, OTHER)).toBe(1);

        // Only the other account's row was sent.
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][0].subvariableId).toBe('b');
        expect(pendingCount(OTHER)).toBe(0);
        expect(pendingCount(OWNER)).toBe(0); // dropped, not replayed under the wrong user
    });

    it('counts only the signed-in account', () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('b', 2), OTHER);
        expect(pendingCount(OWNER)).toBe(1);
        expect(pendingCount(OTHER)).toBe(1);
        expect(pendingCount(undefined)).toBe(0);
    });

    it('ignores writes and flushes without an owner', async () => {
        // The caller has to know it was not queued: returning true here would let
        // the UI report a save that will never happen.
        expect(enqueue(item('a', 1), undefined)).toBe(false);
        expect(enqueue(item('a', 1), OWNER)).toBe(true);
        expect(pendingCount(OWNER)).toBe(1);
        const post = vi.fn();
        expect(await flush(post, undefined)).toBe(0);
        expect(post).not.toHaveBeenCalled();
    });

    it('does not let one account overwrite a same-day row of another', () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('a', 2), OTHER);
        expect(pendingCount(OWNER)).toBe(1);
        expect(pendingCount(OTHER)).toBe(1);
    });
});

describe('clearPendingCheckIns', () => {
    beforeEach(() => window.localStorage.clear());

    it('removes only the deleted account rows and keeps the other account', () => {
        enqueue(item('a', 1), OWNER);
        enqueue(item('b', 2), OTHER);
        clearPendingCheckIns(OWNER);
        expect(pendingCount(OWNER)).toBe(0);
        expect(pendingCount(OTHER)).toBe(1);
    });

    it('leaves unowned rows from older builds alone, because they belong to nobody provably', () => {
        enqueue(item('a', 1), OWNER);
        window.localStorage.setItem('datalyst:pending-checkins-v1', JSON.stringify([
            ...JSON.parse(window.localStorage.getItem('datalyst:pending-checkins-v1') || '[]'),
            { habitId: 'h', subvariableId: 'legacy', numericValue: 3, logicalDate: '2026-11-09' },
        ]));
        clearPendingCheckIns(OWNER);
        expect(pendingCount(OWNER)).toBe(0);
        expect(window.localStorage.getItem('datalyst:pending-checkins-v1')).toContain('legacy');
    });

    it('does nothing without an account', () => {
        enqueue(item('a', 1), OWNER);
        clearPendingCheckIns(undefined);
        clearPendingCheckIns(null);
        expect(pendingCount(OWNER)).toBe(1);
    });
});
