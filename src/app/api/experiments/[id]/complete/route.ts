import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { completeExperiment, ExperimentLifecycleError } from '@/services/attestation.service';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { id } = await params;
        const { experiment, attestation } = await completeExperiment(id, user.id);
        return NextResponse.json({ success: true, experiment: { id, status: experiment.status, isPublic: experiment.isPublic },
            attestation: { uid: attestation?.uid ?? null, mode: attestation?.mode,
                status: attestation?.status ?? 'UNAVAILABLE', verifyUrl: '/verify',
                proofUrl: `/api/experiments/${encodeURIComponent(id)}/attestations`,
                message: 'Proof of content integrity only. Results are not automatically published.' },
        });
    } catch (error) {
        if (error instanceof ExperimentLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'Failed to complete experiment' }, { status: 500 });
    }
}
