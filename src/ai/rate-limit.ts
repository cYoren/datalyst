import 'server-only';

import { checkAgentRateLimit } from '@/lib/agent-rate-limit';

/**
 * Per-user ceiling on provider calls, on top of the daily USD budget. The budget stops a
 * user costing too much; this stops one user (or one retry loop) taking the provider down
 * for everybody in a given minute. Both are cheap, and both fail closed.
 *
 * `AI_RUNS_PER_MINUTE` raises or lowers it; an unreadable value keeps the default.
 */
export const AI_RUNS_PER_MINUTE = 6;

function configuredLimit(): number {
    const raw = Number(process.env.AI_RUNS_PER_MINUTE);
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : AI_RUNS_PER_MINUTE;
}

export interface AiRateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
}

/** Counts one run against the user's minute for this capability. */
export function checkAiRateLimit(
    userId: string,
    capability: string,
    limit: number = configuredLimit(),
): AiRateLimitResult {
    return checkAgentRateLimit(`ai:${userId}:${capability}`, limit);
}
