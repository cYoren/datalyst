/**
 * `POST /api/connect/authorize` — the person approved the connect screen.
 *
 * Session only, never an API key: this is the moment a human grants an app what it may read.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { ServiceError } from '@/lib/error-utils';
import { prisma } from '@/lib/prisma';
import { issueCode, resolveConnectRequest } from '@/lib/connect';

const bodySchema = z.object({
    app: z.string().min(1).max(100),
    redirect_uri: z.string().min(1).max(2048),
    code_challenge: z.string().min(1).max(200),
    state: z.string().min(1).max(200),
    readableSubvariableIds: z.array(z.string()).max(200).default([]),
});

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: { code: 'invalid_body', message: 'The app sent an incomplete request.' } }, { status: 400 });
    }

    try {
        const { app, redirectUri, codeChallenge } = resolveConnectRequest({
            appId: parsed.data.app,
            redirectUri: parsed.data.redirect_uri,
            codeChallenge: parsed.data.code_challenge,
            state: parsed.data.state,
        });

        // Ticking a variable the person does not own would silently grant nothing, so it is a
        // refusal rather than a quiet filter.
        let readable = parsed.data.readableSubvariableIds;
        if (readable.length > 0) {
            const owned = await prismaSubvariableIds(user.id, readable);
            readable = readable.filter((id) => owned.has(id));
        }

        const { redirectTo } = await issueCode({
            userId: user.id,
            appId: app.id,
            redirectUri,
            codeChallenge,
            state: parsed.data.state,
            readableSubvariableIds: readable,
        });

        return NextResponse.json({ redirectTo });
    } catch (error) {
        if (error instanceof ServiceError) {
            return NextResponse.json({ error: { code: 'connect_refused', message: error.message } }, { status: error.status });
        }
        throw error;
    }
}

async function prismaSubvariableIds(userId: string, ids: string[]): Promise<Set<string>> {
    const rows = await prisma.subvariable.findMany({
        where: { id: { in: ids }, habit: { userId, archived: false }, active: true },
        select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
}
