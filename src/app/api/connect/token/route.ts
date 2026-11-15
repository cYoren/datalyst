/**
 * `POST /api/connect/token` — the app trades its one-time code for a key.
 *
 * Unauthenticated by design: the code is the credential, it is bound to the PKCE challenge and
 * the redirect URI, lives 60 seconds and works once.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ServiceError } from '@/lib/error-utils';
import { redeemCode } from '@/lib/connect';

const bodySchema = z.object({
    code: z.string().min(1).max(200),
    code_verifier: z.string().min(43).max(128),
});

export async function POST(request: Request) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: { code: 'invalid_body', message: 'Send the code and the PKCE verifier.' } },
            { status: 400 },
        );
    }

    try {
        const result = await redeemCode({ code: parsed.data.code, codeVerifier: parsed.data.code_verifier });
        // The key is shown once and never stored in plaintext; the app keeps it in its keystore.
        return NextResponse.json(result, {
            status: 201,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        if (error instanceof ServiceError) {
            return NextResponse.json(
                { error: { code: 'connect_refused', message: error.message } },
                { status: error.status, headers: { 'Cache-Control': 'no-store' } },
            );
        }
        throw error;
    }
}
