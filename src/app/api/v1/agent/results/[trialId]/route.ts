import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAgent, forbiddenScopeResponse, hasScope, unauthorizedResponse } from '@/lib/agent-auth';
import { calculateRigorScore } from '@/stats/rigor';
import { getAttestationExplorerUrl } from '@/lib/crypto/eas';
import { appendRateLimitHeaders, checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';
import { getExperimentResults } from '@/services/experiment.service';
import { ServiceError } from '@/lib/error-utils';

export async function GET(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
    const agent = await authenticateAgent(request);
    if (!agent) return unauthorizedResponse();
    const limit = checkAgentRateLimit(`agent:${agent.apiKeyId}:results`, agent.rateLimitPerMinute);
    if (!limit.allowed) return rateLimitedResponse(limit);
    if (!hasScope(agent, 'read')) return appendRateLimitHeaders(forbiddenScopeResponse('read'), limit);
    const respond = (body: unknown, status = 200) => appendRateLimitHeaders(NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }), limit);
    try {
        const { trialId } = await params;
        const analysis = await getExperimentResults(agent.userId, trialId);
        if ('gated' in analysis && analysis.gated) return respond({ success: true, ...analysis });
        const experiment = await prisma.experiment.findFirst({ where: { id: trialId, userId: agent.userId }, include: { protocol: true, attestations: true } });
        if (!experiment) return respond({ success: false, error: 'Trial not found' }, 404);
        const n1 = analysis.stats!.n1;
        const rigor = calculateRigorScore({ hypothesisLockedAt: experiment.hypothesisLockedAt, isBlind: experiment.isBlind,
            autocorrelationIsProblematic: n1?.autocorrelation.isProblematic ?? false, nA: n1?.nA ?? 0, nB: n1?.nB ?? 0, type: experiment.type });
        const record = experiment.attestations.find(record => record.kind === 'RESULTS' && record.status === 'CONFIRMED' && record.mode === 'onchain');
        return respond({ success: true, dataSource: analysis.dataSource,
            trial: { ...analysis.experiment, protocolId: experiment.protocolId, protocolSlug: experiment.protocol?.slug },
            results: n1 ? {
                conditionA: { label: analysis.stats!.conditionLabels[0], n: n1.nA, mean: n1.conditionAMean, std: n1.conditionAStd },
                conditionB: { label: analysis.stats!.conditionLabels[1], n: n1.nB, mean: n1.conditionBMean, std: n1.conditionBStd },
                effectSize: n1.effectSize, effectLabel: n1.effectLabel, pValue: n1.tTest?.pValue ?? null, significant: n1.tTest?.significant ?? false,
            } : null,
            multiArm: analysis.stats!.multiArm, rigor,
            attestation: record?.uid ? { verified: true, meaning: 'Content hash anchored; finding not validated', uid: record.uid, txHash: record.txHash, explorerUrl: getAttestationExplorerUrl(record.uid) } : { verified: false },
            shareUrl: experiment.slug && experiment.isPublic ? `${process.env.NEXT_PUBLIC_APP_URL || ''}/share/${experiment.slug}` : null,
        });
    } catch (error) {
        if (error instanceof ServiceError) return respond({ success: false, error: error.message }, error.status);
        console.error('[Agent API] Failed to get results');
        return respond({ success: false, error: 'Failed to get results' }, 500);
    }
}
