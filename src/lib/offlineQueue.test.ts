import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue, flush, pendingCount } from './offlineQueue';

const item = (subvariableId: string, value: number, logicalDate = '2026-09-24') =>
    ({ habitId: 'h', subvariableId, numericValue: value, logicalDate });

describe('offline check-in queue', () => {
    beforeEach(() => window.localStorage.clear());

    it('keeps only the latest value per variable and day', () => {
        enqueue(item('a', 1));
        enqueue(item('a', 2));
        enqueue(item('a', 3, '2026-09-23'));
        expect(pendingCount()).toBe(2);
    });

    it('replays in order and stops at the first network failure', async () => {
        enqueue(item('a', 1));
        enqueue(item('b', 2));
        const post = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 201 }))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'));
        expect(await flush(post)).toBe(1);
        expect(pendingCount()).toBe(1);
    });

    it('drops permanent rejections but keeps auth and server errors', async () => {
        enqueue(item('a', 1));
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
        expect(pendingCount()).toBe(1);
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
        expect(pendingCount()).toBe(1);
        await flush(vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
        expect(pendingCount()).toBe(0);
    });
});
