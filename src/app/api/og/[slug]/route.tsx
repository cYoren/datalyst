/**
 * Dynamic OG Image Generator
 * 
 * Generates Open Graph images for shared experiments.
 * Shows effect size and verification status.
 */

import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';
import { publicEffectSize } from '@/stats/public-effect';
import { frozenPublicOutcomes, inclusiveStudyEnd } from '@/services/public-outcomes';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const { slug } = await params;

    // Fetch experiment
    const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
            attestations: { select: { kind: true, snapshot: true, dataHash: true, status: true, mode: true, uid: true, txHash: true } },
            dependent: {
                include: { subvariables: { where: { active: true }, take: 1 } },
            },
            assignments: { orderBy: { date: 'asc' } },
        },
    });

    if (!experiment || !experiment.isPublic) {
        return new Response('Not found', { status: 404 });
    }

    const dependentSub = experiment.dependent.subvariables[0];
    let frozen: ReturnType<typeof frozenPublicOutcomes>;
    try { frozen = frozenPublicOutcomes(experiment.attestations); } catch { return new Response('Not found', { status: 404 }); }

    // Fetch entries for stats
    const dependentEntries = !frozen && dependentSub ? await prisma.habitEntry.findMany({
        where: {
            habitId: experiment.dependentId,
            userId: experiment.userId,
            logicalDate: {
                gte: new Date(experiment.startDate),
                lt: inclusiveStudyEnd(experiment.endDate),
            },
        },
        include: {
            subvariableEntries: { where: { subvariableId: dependentSub?.id } },
        },
    }) : [];

    // Build map and split by condition
    const dependentMap = new Map<string, number>();
    dependentEntries.forEach(entry => {
        const dateStr = entry.logicalDate.toISOString().split('T')[0];
        const subEntry = entry.subvariableEntries[0];
        if (subEntry && Number.isFinite(subEntry.numericValue)) dependentMap.set(dateStr, subEntry.numericValue);
    });

    const condA: number[] = frozen?.condA ?? [];
    const condB: number[] = frozen?.condB ?? [];
    for (const assignment of experiment.assignments) {
        if (frozen) break;
        if (assignment.isWashout) continue;
        const value = dependentMap.get(assignment.date);
        if (value === undefined) continue;
        if (assignment.condition === 'A') condA.push(value);
        else if (assignment.condition === 'B') condB.push(value);
    }

    // Calculate effect size
    const binaryConditions = frozen?.binaryConditions ?? experiment.assignments.filter(assignment => !assignment.isWashout).every(assignment => assignment.condition === 'A' || assignment.condition === 'B');
    const effectSize = publicEffectSize(condA, condB, binaryConditions);
    const isPositive = effectSize !== null && effectSize > 0;
    const hasAttestation = !!experiment.attestations?.some(record => record.kind === 'RESULTS' && record.mode === 'onchain' && record.status === 'CONFIRMED' && record.uid && record.txHash);

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#0f172a',
                    backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    fontFamily: 'system-ui, sans-serif',
                }}
            >
                {/* Purple accent bar */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 6,
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                    }}
                />

                {/* Main content */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 24,
                    }}
                >
                    {/* Title */}
                    <div
                        style={{
                            fontSize: 48,
                            fontWeight: 700,
                            color: 'white',
                            textAlign: 'center',
                            maxWidth: 1000,
                            lineHeight: 1.2,
                        }}
                    >
                        {experiment.name}
                    </div>

                    {/* Effect Size */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                        }}
                    >
                        <div
                            style={{
                                fontSize: effectSize === null ? 64 : 120,
                                fontWeight: 900,
                                color: effectSize === null ? '#aaa9a6' : isPositive ? '#5ed3b5' : '#ff8a6b',
                            }}
                        >
                            {effectSize === null ? 'Not estimable' : `${effectSize > 0 ? '+' : ''}${effectSize.toFixed(2)}`}
                        </div>
                    </div>

                    {/* Label */}
                    <div
                        style={{
                            fontSize: 24,
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                        }}
                    >
                        Effect Size (Cohen&apos;s d)
                    </div>

                    {/* Verification badge */}
                    {hasAttestation && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 24px',
                                backgroundColor: '#166534',
                                borderRadius: 9999,
                                marginTop: 16,
                            }}
                        >
                            <span style={{ fontSize: 20, color: 'white' }}>
                                Content hash on Base
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 32,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: '#64748b',
                        fontSize: 18,
                    }}
                >
                    <span>Datalyst</span>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'no-store, private' },
        }
    );
}
