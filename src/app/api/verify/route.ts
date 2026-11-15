import { NextResponse } from 'next/server';
import { verifyBundle } from '@/lib/crypto/verify-bundle';
import { getSigner } from '@/lib/crypto/eas';
import { checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';

export async function POST(request: Request) {
    // Bucketed per caller, not globally: a shared counter meant 61 anonymous requests from
    // anywhere locked the public proof checker for everyone (`ROADMAP.md` S2). Cloudflare sets
    // CF-Connecting-IP; without it, fall back to a forwarded address rather than one global
    // bucket, so a single abuser cannot deny the endpoint to the rest.
    const caller = request.headers.get('cf-connecting-ip')
        ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? 'unknown';
    const limit = await checkAgentRateLimit(`public:proof-verification:${caller}`, 60);
    if (!limit.allowed) return rateLimitedResponse(limit);
    if (Number(request.headers.get('content-length') || 0) > 1_000_000) return NextResponse.json({ error: 'Proof bundle is too large' }, { status: 413 });
    try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 1_000_000) return NextResponse.json({ error: 'Proof bundle is too large' }, { status: 413 });
        const proofs = await verifyBundle(JSON.parse(raw));
        let trustedSigner = process.env.EAS_TRUSTED_SIGNER_ADDRESS;
        if (!trustedSigner) { try { trustedSigner = getSigner().address; } catch { /* verification works without signing credentials */ } }
        return NextResponse.json({ valid: true, proofs, trustedSigner: trustedSigner ?? null,
            signedByDatalyst: !!trustedSigner && proofs.every(p => p.signer.toLowerCase() === trustedSigner!.toLowerCase()),
            message: 'Content integrity verified. This does not establish truth, research quality, or medical validity. Offchain times are asserted by the signer.' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ valid: false, error: 'Unable to verify. Check the snapshot, signatures, preregistration link, and Base RPC availability for onchain proofs.' }, { status: 400 });
    }
}
