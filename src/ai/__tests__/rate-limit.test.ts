import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The AI limit is now a database row per user, capability and minute (`ROADMAP.md` S2), so these
 * tests drive the counter through a mocked table rather than a module-level Map: the point is
 * that two isolates share one count, which an in-process test could not show.
 */
const counts = vi.hoisted(() => new Map<string, number>());

vi.mock('@/lib/prisma', () => ({
    prisma: {
        apiKeyUsage: {
            upsert: async ({ where, update }: { where: { subject_windowStart: { subject: string } }; update: { count: { increment: number } } }) => {
                const subject = where.subject_windowStart.subject;
                const next = (counts.get(subject) ?? 0) + update.count.increment;
                counts.set(subject, next);
                return { count: next };
            },
        },
    },
}));

import { AI_RUNS_PER_MINUTE, checkAiRateLimit } from '../rate-limit';

beforeEach(() => counts.clear());

describe('AI rate limit', () => {
    it('allows the configured number of runs per user per capability', async () => {
        const user = 'user-1';
        for (let i = 0; i < AI_RUNS_PER_MINUTE; i += 1) {
            expect((await checkAiRateLimit(user, 'insights')).allowed).toBe(true);
        }
        const blocked = await checkAiRateLimit(user, 'insights');
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
        expect(blocked.resetSeconds).toBeGreaterThan(0);
    });

    it('counts each capability and each user separately', async () => {
        const user = 'user-1';
        for (let i = 0; i < AI_RUNS_PER_MINUTE; i += 1) await checkAiRateLimit(user, 'insights');
        expect((await checkAiRateLimit(user, 'insights')).allowed).toBe(false);
        // A user who spent the insight budget can still log in plain language.
        expect((await checkAiRateLimit(user, 'quick_log')).allowed).toBe(true);
        expect((await checkAiRateLimit('user-2', 'insights')).allowed).toBe(true);
    });

    it('takes an explicit limit when a capability is cheaper or dearer', async () => {
        expect((await checkAiRateLimit('user-1', 'experiment_planner', 1)).allowed).toBe(true);
        expect((await checkAiRateLimit('user-1', 'experiment_planner', 1)).allowed).toBe(false);
    });

    it('counts in one shared row per subject, not per process', async () => {
        await checkAiRateLimit('user-1', 'insights');
        await checkAiRateLimit('user-1', 'insights');
        // The second call incremented the same row: the key the database would hold is identical.
        expect(counts.get('ai:user-1:insights')).toBe(2);
    });
});
