import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { API_KEY_SCOPES, generateApiKey } from '@/lib/agent-auth';

const MAX_ACTIVE_KEYS = 10;

const createKeySchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['read']),
});

const listSelect = {
    id: true,
    name: true,
    prefix: true,
    scopes: true,
    rateLimitPerMinute: true,
    createdAt: true,
    lastUsedAt: true,
} as const;

/**
 * GET /api/user/api-keys: list the signed-in user's active keys (never the key itself).
 * Session (cookie) auth only, so an API key can never mint more keys.
 */
export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const keys = await prisma.apiKey.findMany({
        where: { userId: user.id, isActive: true, revokedAt: null },
        select: listSelect,
        orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ keys });
}

/** POST /api/user/api-keys: create a key. The plaintext is in this response only. */
export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = createKeySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const activeCount = await prisma.apiKey.count({
        where: { userId: user.id, isActive: true, revokedAt: null },
    });
    if (activeCount >= MAX_ACTIVE_KEYS) {
        return NextResponse.json({ error: `You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` }, { status: 400 });
    }

    const { key, keyHash, prefix } = generateApiKey();
    // Stored scopes are ordered and deduplicated; "write" implies nothing else.
    const scopes = API_KEY_SCOPES.filter((s) => parsed.data.scopes.includes(s));
    const record = await prisma.apiKey.create({
        data: { userId: user.id, name: parsed.data.name, keyHash, prefix, scopes },
        select: listSelect,
    });

    return NextResponse.json({ key, apiKey: record }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
