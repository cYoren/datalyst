/**
 * Device credential for the home screen widget.
 *
 * Same table and hashing as the self-serve API keys, with a scope no user-facing key can
 * have: the widget may log a yes/no check-in and nothing else. One key per install, capped at
 * five per account with the oldest retired at the cap (never per issue, or a phone and a
 * tablet would revoke each other), revoked in Settings like any other key.
 */

import { authenticateAgent, generateApiKey, type AuthenticatedAgent } from '@/lib/agent-auth';
import { prisma } from '@/lib/prisma';
import { WIDGET_LOG_SCOPE } from '@/lib/widget-next';

export const WIDGET_KEY_NAME = 'Home screen widget';

/** One key per install; a phone and a tablet are normal, a pile of them is not. */
export const MAX_WIDGET_KEYS = 5;

/**
 * Issues a device key for the widget, retiring the oldest when the cap is reached. Rotation
 * is deliberately not per-issue: two devices would otherwise revoke each other on every sync.
 * The plaintext is returned once and never stored.
 */
export async function issueWidgetKey(userId: string): Promise<string> {
    const existing = await prisma.apiKey.findMany({
        where: { userId, scopes: { has: WIDGET_LOG_SCOPE }, isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
    });

    if (existing.length >= MAX_WIDGET_KEYS) {
        const surplus = existing.slice(0, existing.length - MAX_WIDGET_KEYS + 1);
        await prisma.apiKey.updateMany({
            where: { id: { in: surplus.map((key) => key.id) } },
            data: { isActive: false, revokedAt: new Date() },
        });
    }

    const { key, keyHash, prefix } = generateApiKey();
    await prisma.apiKey.create({
        data: {
            userId,
            name: WIDGET_KEY_NAME,
            keyHash,
            prefix,
            scopes: [WIDGET_LOG_SCOPE],
            // A widget writes a check-in or two a day, never a stream.
            rateLimitPerMinute: 20,
        },
    });
    return key;
}

/** Authenticates a widget request. A normal API key without the widget scope is not enough. */
export async function authenticateWidget(request: Request): Promise<AuthenticatedAgent | null> {
    const agent = await authenticateAgent(request);
    if (!agent || !agent.scopes.includes(WIDGET_LOG_SCOPE)) return null;
    return agent;
}
