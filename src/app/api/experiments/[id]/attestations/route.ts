import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { prisma } from '@/lib/prisma';
import { issueAttestation } from '@/services/attestation.service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const experiment = await prisma.experiment.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!experiment) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    const records = await prisma.experimentAttestation.findMany({ where: { experimentId: id }, orderBy: { createdAt: 'asc' } });
    return NextResponse.json({ format: 'datalyst-proof-bundle-v1',
        records: records.map(({ kind, mode, status, snapshot, dataHash, uid, txHash, proof }) => ({ kind, mode, status, snapshot, dataHash, uid, txHash, proof })),
        limitation: 'Content integrity only; offchain signing time is signer asserted, not independently timestamped.',
    }, { headers: { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="datalyst-proofs.json"' } });
}

// Retry unavailable signatures or check a pending transaction; frozen snapshots stay unchanged.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!await prisma.experiment.findFirst({ where: { id, userId: user.id }, select: { id: true } })) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    await issueAttestation(id, user.id, 'PREREG');
    await issueAttestation(id, user.id, 'RESULTS');
    return GET(_request, { params: Promise.resolve({ id }) });
}
