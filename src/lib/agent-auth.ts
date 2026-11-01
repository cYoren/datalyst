/**
 * Agent API authentication.
 *
 * Keys are stored only as a SHA-256 hash. Keys are high-entropy random strings,
 * so a fast hash is the standard choice (no salt or KDF needed). Revocation is
 * immediate because every request looks the key up in the database.
 */

import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export const API_KEY_SCOPES = ['read', 'write', 'research:read', 'research:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const KEY_PREFIX = 'dl_';
const DISPLAY_PREFIX_LENGTH = 10;

export interface AuthenticatedAgent {
    apiKeyId: string;
    userId: string;
    agentName: string;
    agentId?: string;
    scopes: string[];
    rateLimitPerMinute: number;
}

export function hashApiKey(key: string): string {
    return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Creates a new key. The plaintext is returned once and never stored. */
export function generateApiKey() {
    const key = KEY_PREFIX + randomBytes(32).toString('base64url');
    return { key, keyHash: hashApiKey(key), prefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/** Reads the key from `Authorization: Bearer <key>` or `X-API-Key`. */
export function extractApiKey(headers: Headers): string | null {
    const auth = headers.get('authorization');
    const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const key = bearer || headers.get('x-api-key')?.trim();
    return key && key.length <= 200 ? key : null;
}

export function hasScope(agent: Pick<AuthenticatedAgent, 'scopes'>, scope: ApiKeyScope): boolean {
    return agent.scopes.includes(scope);
}

/**
 * Authenticate a request by API key. Returns null for a missing, unknown,
 * or revoked key.
 */
export async function authenticateAgent(
    request: Request
): Promise<AuthenticatedAgent | null> {
    const apiKey = extractApiKey(request.headers);
    if (!apiKey) return null;

    try {
        const keyRecord = await prisma.apiKey.findUnique({
            where: { keyHash: hashApiKey(apiKey) },
            select: {
                id: true,
                name: true,
                agentId: true,
                userId: true,
                isActive: true,
                revokedAt: true,
                scopes: true,
                rateLimitPerMinute: true,
            },
        });

        if (!keyRecord || !keyRecord.isActive || keyRecord.revokedAt) {
            return null;
        }

        // Update last used timestamp (fire and forget)
        prisma.apiKey.update({
            where: { id: keyRecord.id },
            data: { lastUsedAt: new Date() },
        }).catch(() => { });

        return {
            apiKeyId: keyRecord.id,
            userId: keyRecord.userId,
            agentName: keyRecord.name,
            agentId: keyRecord.agentId ?? undefined,
            scopes: keyRecord.scopes,
            rateLimitPerMinute: keyRecord.rateLimitPerMinute,
        };
    } catch {
        console.error('[Agent Auth] Failed to authenticate');
        return null;
    }
}

/**
 * Create a standard unauthorized response
 */
export function unauthorizedResponse(message = 'Invalid or missing API key') {
    return new Response(
        JSON.stringify({ success: false, error: message }),
        {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        }
    );
}

export function forbiddenScopeResponse(scope: ApiKeyScope) {
    return new Response(
        JSON.stringify({ success: false, error: `This API key lacks the "${scope}" scope` }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
}
