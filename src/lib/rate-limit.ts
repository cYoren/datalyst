/**
 * Rate limiting, counted durably (`ROADMAP.md` S2).
 *
 * The old counter was a module-level Map, so it was per isolate: two Workers instances each
 * allowed the full limit, and a restart forgot every count. `ApiKeyUsage` now holds one row per
 * subject per minute — a key's id, or a namespaced subject such as `ai:<userId>:insights` — so
 * the limit is shared and survives a restart.
 *
 * A counter that cannot be written fails **closed**: a limiter that quietly stops limiting is
 * worse than a slow request.
 */

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

const WINDOW_MS = 60_000;

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
}

function windowFor(now = Date.now()) {
    const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
    const resetSeconds = Math.max(1, Math.ceil((windowStart.getTime() + WINDOW_MS - now) / 1000));
    return { windowStart, resetSeconds };
}

/**
 * Counts one request against a key's minute.
 *
 * Every route that authenticates with an API key uses this, so the *count* is shared and durable.
 * The bucket is not: callers pass a namespace (`agent:<id>:log`, `mcp:<id>`, the app API's bare
 * key id) and each namespace has its own allowance. One bucket across routes would let a burst of
 * reads spend the writes' allowance.
 */
export async function checkKeyRateLimit(apiKeyId: string, limit: number): Promise<RateLimitResult> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const { windowStart, resetSeconds } = windowFor();

    try {
        const row = await prisma.apiKeyUsage.upsert({
            where: { apiKeyId_windowStart: { apiKeyId, windowStart } },
            create: { apiKeyId, windowStart, count: 1 },
            update: { count: { increment: 1 } },
            select: { count: true },
        });
        const remaining = Math.max(0, safeLimit - row.count);
        return { allowed: row.count <= safeLimit, limit: safeLimit, remaining, resetSeconds };
    } catch {
        return { allowed: false, limit: safeLimit, remaining: 0, resetSeconds };
    }
}

/** Counts one unit against a namespaced subject that is not a key (an AI run, for instance). */
export async function checkSubjectRateLimit(subject: string, limit: number): Promise<RateLimitResult> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const { windowStart, resetSeconds } = windowFor();

    try {
        const row = await prisma.apiKeyUsage.upsert({
            where: { subject_windowStart: { subject, windowStart } },
            create: { subject, windowStart, count: 1 },
            update: { count: { increment: 1 } },
            select: { count: true },
        });
        const remaining = Math.max(0, safeLimit - row.count);
        return { allowed: row.count <= safeLimit, limit: safeLimit, remaining, resetSeconds };
    } catch {
        return { allowed: false, limit: safeLimit, remaining: 0, resetSeconds };
    }
}

export function appendRateLimitHeaders<T extends Response = NextResponse>(response: T, result: RateLimitResult): T {
    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.resetSeconds));
    return response;
}

export function rateLimitedResponse(result: RateLimitResult) {
    const response = NextResponse.json(
        {
            success: false,
            error: 'Rate limit exceeded',
            retryAfterSeconds: result.resetSeconds,
        },
        { status: 429 },
    );
    response.headers.set('Retry-After', String(result.resetSeconds));
    return appendRateLimitHeaders(response, result);
}
