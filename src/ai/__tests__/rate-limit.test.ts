import { describe, it, expect } from 'vitest';
import { AI_RUNS_PER_MINUTE, checkAiRateLimit } from '../rate-limit';

describe('AI rate limit', () => {
    it('allows the configured number of runs per user per capability', () => {
        const user = `user-${Math.random()}`;
        for (let i = 0; i < AI_RUNS_PER_MINUTE; i += 1) {
            expect(checkAiRateLimit(user, 'insights').allowed).toBe(true);
        }
        const blocked = checkAiRateLimit(user, 'insights');
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
        expect(blocked.resetSeconds).toBeGreaterThan(0);
    });

    it('counts each capability and each user separately', () => {
        const user = `user-${Math.random()}`;
        for (let i = 0; i < AI_RUNS_PER_MINUTE; i += 1) checkAiRateLimit(user, 'insights');
        expect(checkAiRateLimit(user, 'insights').allowed).toBe(false);
        // A user who spent the insight budget can still log in plain language.
        expect(checkAiRateLimit(user, 'quick_log').allowed).toBe(true);
        expect(checkAiRateLimit(`${user}-other`, 'insights').allowed).toBe(true);
    });

    it('takes an explicit limit when a capability is cheaper or dearer', () => {
        const user = `user-${Math.random()}`;
        expect(checkAiRateLimit(user, 'experiment_planner', 1).allowed).toBe(true);
        expect(checkAiRateLimit(user, 'experiment_planner', 1).allowed).toBe(false);
    });
});
