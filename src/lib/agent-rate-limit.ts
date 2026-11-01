import { NextResponse } from "next/server";

type RateLimitBucket = {
    windowStartMs: number;
    count: number;
};

type RateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
};

const WINDOW_MS = 60_000;

const globalBuckets = globalThis as typeof globalThis & {
    __agentRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets = globalBuckets.__agentRateLimitBuckets ?? new Map<string, RateLimitBucket>();
if (!globalBuckets.__agentRateLimitBuckets) {
    globalBuckets.__agentRateLimitBuckets = buckets;
}

export function checkAgentRateLimit(key: string, limit: number): RateLimitResult {
    const now = Date.now();
    const safeLimit = Math.max(1, Math.floor(limit));

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStartMs >= WINDOW_MS) {
        buckets.set(key, { windowStartMs: now, count: 1 });
        return {
            allowed: true,
            limit: safeLimit,
            remaining: safeLimit - 1,
            resetSeconds: Math.ceil(WINDOW_MS / 1000),
        };
    }

    bucket.count += 1;

    const resetSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStartMs)) / 1000));
    const remaining = Math.max(0, safeLimit - bucket.count);
    const allowed = bucket.count <= safeLimit;

    return {
        allowed,
        limit: safeLimit,
        remaining,
        resetSeconds,
    };
}

export function appendRateLimitHeaders<T extends Response = NextResponse>(response: T, result: RateLimitResult): T {
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.resetSeconds));
    return response;
}

export function rateLimitedResponse(result: RateLimitResult) {
    const response = NextResponse.json(
        {
            success: false,
            error: "Rate limit exceeded",
            retryAfterSeconds: result.resetSeconds,
        },
        { status: 429 }
    );
    response.headers.set("Retry-After", String(result.resetSeconds));
    return appendRateLimitHeaders(response, result);
}
