// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ROADMAP.md` S2: the limit must hold across instances. That is only true if the count lives in
 * one shared row per subject per minute, so these tests assert the row — not a process-local Map.
 */
const db = vi.hoisted(() => ({ rows: new Map<string, number>(), fail: false }));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        apiKeyUsage: {
            upsert: async ({ where, update }: {
                where: { apiKeyId_windowStart?: { apiKeyId: string }; subject_windowStart?: { subject: string } };
                update: { count: { increment: number } };
            }) => {
                if (db.fail) throw new Error('database down');
                const subject = where.subject_windowStart?.subject ?? where.apiKeyId_windowStart?.apiKeyId ?? 'x';
                const column = where.subject_windowStart ? 'subject' : 'key';
                const key = `${column}:${subject}`;
                const next = (db.rows.get(key) ?? 0) + update.count.increment;
                db.rows.set(key, next);
                return { count: next };
            },
        },
    },
}));

import { checkKeyRateLimit, checkSubjectRateLimit, rateLimitedResponse } from './rate-limit';

beforeEach(() => {
    db.rows.clear();
    db.fail = false;
});

describe('a key rate limit counted in the database', () => {
    it('shares one count between two module instances, which is what two isolates are', async () => {
        // The count must not live in the module: a Map or a global would start from zero in a
        // second isolate. Clearing the module registry is the closest a unit test gets to one.
        vi.resetModules();
        const first = await import('./rate-limit');
        expect((await first.checkSubjectRateLimit('isolate-shared', 2)).allowed).toBe(true);

        vi.resetModules();
        const second = await import('./rate-limit');
        expect((await second.checkSubjectRateLimit('isolate-shared', 2)).allowed).toBe(true);

        vi.resetModules();
        const third = await import('./rate-limit');
        // The third request in the same minute is refused, in every instance.
        expect((await third.checkSubjectRateLimit('isolate-shared', 2)).allowed).toBe(false);
        expect(db.rows.get('subject:isolate-shared')).toBe(3);
    });

    it('shares one count between callers for the same minute', async () => {
        // Two isolates are two calls to the same counter: neither gets a private allowance.
        const first = await checkKeyRateLimit('key-1', 2);
        const second = await checkKeyRateLimit('key-1', 2);
        const third = await checkKeyRateLimit('key-1', 2);

        expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
        expect(first.remaining).toBe(1);
        expect(db.rows.get('key:key-1')).toBe(3);
    });

    it('keeps different keys and different subjects apart', async () => {
        await checkKeyRateLimit('key-1', 1);
        expect((await checkKeyRateLimit('key-1', 1)).allowed).toBe(false);
        expect((await checkKeyRateLimit('key-2', 1)).allowed).toBe(true);

        await checkSubjectRateLimit('ai:user-1:insights', 1);
        expect((await checkSubjectRateLimit('ai:user-1:insights', 1)).allowed).toBe(false);
        expect((await checkSubjectRateLimit('ai:user-2:insights', 1)).allowed).toBe(true);
    });

    it('fails closed when the counter cannot be written', async () => {
        db.fail = true;
        const result = await checkKeyRateLimit('key-1', 60);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it('answers a refused request with a Retry-After a client can obey', async () => {
        const response = rateLimitedResponse({ allowed: false, limit: 10, remaining: 0, resetSeconds: 42 });
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('42');
        expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    });
});
