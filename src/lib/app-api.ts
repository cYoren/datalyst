/**
 * The connected-app API: `/api/v1/app/*` (`docs/CONNECTED-APPS.md`, "The API").
 *
 * A thin layer over the services the app already uses. Two things are deliberate here:
 * errors are a stable `code` plus a sentence a person could read, and the rate limit is
 * counted in the database so two isolates share one limit.
 */

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { authenticateAppKey, type AuthenticatedAgent } from '@/lib/agent-auth';
import { APP_SCOPES } from '@/lib/connected-apps';
import { checkKeyRateLimit, type RateLimitResult } from '@/lib/rate-limit';

export interface AppApiError {
    error: { code: string; message: string };
}

export function appError(status: number, code: string, message: string): NextResponse<AppApiError> {
    return NextResponse.json({ error: { code, message } }, { status });
}

/** Authenticates an app key and checks one app scope. Returns the error response to send, or the agent. */
export async function requireApp(
    request: Request,
    scope: (typeof APP_SCOPES)[number],
): Promise<{ agent: AuthenticatedAgent } | { response: NextResponse }> {
    const agent = await authenticateAppKey(request);
    if (!agent) {
        return { response: appError(401, 'unauthorized', 'This key is missing, revoked, or not an app key.') };
    }
    if (!agent.scopes.includes(scope)) {
        return { response: appError(403, 'forbidden_scope', `This app needs the "${scope}" scope.`) };
    }
    return { agent };
}

export type DurableRateLimit = RateLimitResult;

/** Counts a request against the key's minute, in the database (`src/lib/rate-limit.ts`). */
export async function checkDurableRateLimit(apiKeyId: string, limit: number): Promise<RateLimitResult> {
    return checkKeyRateLimit(apiKeyId, limit);
}

export function withRateLimitHeaders<T extends NextResponse>(response: T, rate: DurableRateLimit): T {
    response.headers.set('X-RateLimit-Limit', String(rate.limit));
    response.headers.set('X-RateLimit-Remaining', String(rate.remaining));
    response.headers.set('X-RateLimit-Reset', String(rate.resetSeconds));
    return response;
}

export function rateLimited(rate: DurableRateLimit): NextResponse<AppApiError> {
    const response = appError(429, 'rate_limited', 'Too many requests from this app. Try again shortly.');
    response.headers.set('Retry-After', String(rate.resetSeconds));
    return withRateLimitHeaders(response, rate);
}

/** `YYYY-MM-DD`, checked as a real calendar day so a typo cannot become a different month. */
export function isCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const MAX_RANGE_DAYS = 92;
export const MAX_WRITE_DAYS_BACK = 30;
export const MAX_WRITES_PER_REQUEST = 50;

/** Days between two calendar dates, both ends inclusive. */
export function daysBetween(from: string, to: string): number {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((end - start) / 86_400_000) + 1;
}

/** Today's calendar date in UTC, used only to bound writes, never to choose a day for the app. */
/** A sentence the person could read, for a value the type or range rejects. */
export function validateValue(type: string, value: number, metadata: string | null | undefined): string | null {
    if (!Number.isFinite(value)) return 'Value must be a number.';
    if (type === 'BOOLEAN') return value === 0 || value === 1 ? null : 'This variable is yes or no (1 or 0).';
    if (type === 'SCALE_0_10') return value >= 0 && value <= 10 ? null : 'This variable goes from 0 to 10.';
    if (type === 'NUMERIC') {
        let bounds: { min?: number; max?: number } = {};
        try { bounds = JSON.parse(metadata || '{}'); } catch { /* legacy metadata carries no bounds */ }
        if (typeof bounds.min === 'number' && value < bounds.min) return `Value must be at least ${bounds.min}.`;
        if (typeof bounds.max === 'number' && value > bounds.max) return `Value must be at most ${bounds.max}.`;
    }
    return null;
}

export async function logApiKeyEvent(input: {
    apiKeyId: string;
    appId: string | null;
    action: string;
    habitId?: string | null;
    logicalDate?: Date | null;
}): Promise<void> {
    try {
        await prisma.apiKeyEvent.create({
            data: {
                apiKeyId: input.apiKeyId,
                appId: input.appId,
                action: input.action,
                habitId: input.habitId ?? null,
                logicalDate: input.logicalDate ?? null,
            },
        });
    } catch {
        // The audit trail must never fail the write it describes.
    }
}
