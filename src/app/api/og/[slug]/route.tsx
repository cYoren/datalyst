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
import { resultCard } from '@/lib/result-card';

export const runtime = 'nodejs';

/** A date the row may not have; an unreadable one becomes empty rather than throwing. */
function isoDay(value: Date | string | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

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
            independent: { select: { name: true } },
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
    const hasAttestation = !!experiment.attestations?.some(record => record.kind === 'RESULTS' && record.mode === 'onchain' && record.status === 'CONFIRMED' && record.uid && record.txHash);

    // Same four things, same order, as the share page: question, days, verdict, number with its
    // interval (`ROADMAP.md` A5). A null result renders like any other.
    const card = resultCard({
        title: experiment.name,
        startDate: isoDay(experiment.startDate),
        endDate: isoDay(experiment.endDate),
        outcome: experiment.dependent.name,
        change: (experiment.independent?.name ?? 'the change').toLowerCase(),
        daysA: condA.length,
        daysB: condB.length,
        effectSize,
        pValue: null,
        mode: binaryConditions ? 'two-arm' : 'multi-arm',
    });

    const tone =
        card.verdict.kind === 'clear-change' ? '#5ed3b5'
            : card.verdict.kind === 'within-noise' ? '#ffd166'
                : '#94a3b8';

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
                    padding: 64,
                    gap: 20,
                }}
            >
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

                <div style={{ fontSize: 44, fontWeight: 700, color: 'white', textAlign: 'center', maxWidth: 1000, lineHeight: 1.2 }}>
                    {card.title}
                </div>

                <div style={{ fontSize: 22, color: '#94a3b8' }}>{card.days}</div>

                <div style={{ fontSize: 56, fontWeight: 800, color: tone, textAlign: 'center' }}>
                    {card.verdict.headline}
                </div>

                <div style={{ fontSize: 26, color: '#cbd5e1', textAlign: 'center', maxWidth: 980, lineHeight: 1.35 }}>
                    {card.number}
                </div>

                {hasAttestation && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 24px',
                            backgroundColor: '#166534',
                            borderRadius: 9999,
                            marginTop: 8,
                        }}
                    >
                        <span style={{ fontSize: 20, color: 'white' }}>Content hash on Base</span>
                    </div>
                )}

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
                    <span>Datalyst · datalyst.one</span>
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
