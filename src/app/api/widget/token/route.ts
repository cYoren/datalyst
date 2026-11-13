import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { issueWidgetKey } from '@/lib/widget-auth';
import { appendRateLimitHeaders, checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';

/** One issue per install, not one per sync: a shell that keeps failing must not churn rows. */
export const WIDGET_ISSUES_PER_MINUTE = 3;

export const dynamic = 'force-dynamic';

/**
 * POST /api/widget/token
 * Hands the native shell a device key for the home screen widget. Session auth only, so a
 * key can never mint another key. Keys are capped per account and the oldest is retired at
 * the cap, never on every issue: a phone and a tablet would otherwise revoke each other.
 * The shell asks again whenever its copy stops working.
 */
export async function POST() {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Each issue writes a row and, at the cap, retires another device's key. A shell that
        // retries on every poll would churn both, so issuance is limited per user.
        const rateLimit = checkAgentRateLimit(`widget-token:${user.id}`, WIDGET_ISSUES_PER_MINUTE);
        if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

        const token = await issueWidgetKey(user.id);
        return appendRateLimitHeaders(
            NextResponse.json({ token }, { status: 201, headers: { 'Cache-Control': 'no-store' } }),
            rateLimit,
        );
    } catch (error) {
        console.error('Error issuing widget key:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export function GET() {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
