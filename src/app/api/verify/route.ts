import { NextResponse } from 'next/server';
import { verifyBundle } from '@/lib/crypto/verify-bundle';
import { getSigner } from '@/lib/crypto/eas';
import { checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';

export async function POST(request: Request) {
    const limit = checkAgentRateLimit('public:proof-verification', 60);
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
