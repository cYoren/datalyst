/**
 * Public Share Page
 * 
 * Displays a read-only view of experiment results.
 * Accessible without authentication via the experiment slug.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/Card';
import { FlaskConical, ExternalLink, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { calculateRigorScore, getRigorGradeColor, RigorScoreInput } from '@/stats/rigor';
import { getAttestationExplorerUrl } from '@/lib/crypto/eas';
import { Metadata } from 'next';
import { publicEffectSize } from '@/stats/public-effect';
import { frozenPublicOutcomes, inclusiveStudyEnd } from '@/services/public-outcomes';

interface PageProps {
    params: Promise<{ slug: string }>;
}

// Generate dynamic metadata for OG images
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;

    const experiment = await prisma.experiment.findUnique({
        where: { slug },
        select: { name: true, isPublic: true },
    });

    if (!experiment || !experiment.isPublic) {
        return { title: 'Experiment Not Found' };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://datalyst.one';

    return {
        title: `${experiment.name} | Datalyst`,
        description: 'View a shared personal experiment.',
        openGraph: {
            title: experiment.name,
            description: 'Shared N=1 experiment results',
            images: [`${appUrl}/api/og/${slug}`],
            type: 'article',
        },
        twitter: {
            card: 'summary_large_image',
            title: experiment.name,
            description: 'Shared N=1 experiment results',
            images: [`${appUrl}/api/og/${slug}`],
        },
    };
}

export default async function SharePage({ params }: PageProps) {
    const { slug } = await params;

    // Fetch the experiment
    const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
            protocol: true,
            attestations: { select: { kind: true, snapshot: true, dataHash: true, status: true, mode: true, uid: true, txHash: true } },
            independent: {
                include: { subvariables: { where: { active: true }, take: 1 } },
            },
            dependent: {
                include: { subvariables: { where: { active: true }, take: 1 } },
            },
            assignments: { orderBy: { date: 'asc' } },
        },
    });

    if (!experiment || !experiment.isPublic) {
        notFound();
    }

    const dependentSub = experiment.dependent.subvariables[0];
    let frozen: ReturnType<typeof frozenPublicOutcomes>;
    try { frozen = frozenPublicOutcomes(experiment.attestations); } catch { notFound(); }

    // Fetch entries
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

    // Build dependent map
    const dependentMap = new Map<string, number>();
    dependentEntries.forEach(entry => {
        const dateStr = entry.logicalDate.toISOString().split('T')[0];
        const subEntry = entry.subvariableEntries[0];
        if (subEntry && Number.isFinite(subEntry.numericValue)) dependentMap.set(dateStr, subEntry.numericValue);
    });

    // Split by condition
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

    // Calculate stats
    const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const std = (arr: number[]) => {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
    };

    const condAMean = mean(condA);
    const condBMean = mean(condB);
    const binaryConditions = frozen?.binaryConditions ?? experiment.assignments.filter(assignment => !assignment.isWashout).every(assignment => assignment.condition === 'A' || assignment.condition === 'B');
    const effectSize = publicEffectSize(condA, condB, binaryConditions);
    const isPositive = effectSize !== null && effectSize > 0;

    // Rigor score
    const rigorInput: RigorScoreInput = {
        hypothesisLockedAt: experiment.hypothesisLockedAt,
        isBlind: experiment.isBlind,
        autocorrelationIsProblematic: false,
        nA: condA.length,
        nB: condB.length,
        type: experiment.type as 'OBSERVATIONAL' | 'RANDOMIZED' | 'BLIND_RCT',
    };
    const rigor = calculateRigorScore(rigorInput);

    const anchored = experiment.attestations?.find(record => record.kind === 'RESULTS' && record.mode === 'onchain' && record.status === 'CONFIRMED' && record.uid && record.txHash);
    const hasAttestation = !!anchored;

    return (
        <div className="min-h-screen bg-[var(--color-bg-subtle)] py-12 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-violet)]/15 text-[var(--color-violet)] text-sm font-medium">
                        <FlaskConical className="h-4 w-4" />
                        Shared Experiment
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--color-text-primary)] ">
                        {experiment.name}
                    </h1>
                    {experiment.protocol && (
                        <p className="text-[var(--color-text-secondary)] ">
                            Protocol: {experiment.protocol.name}
                        </p>
                    )}
                </div>

                {/* Main Results Card */}
                <Card className="p-6 space-y-6">
                    {/* Effect Size */}
                    <div className="text-center space-y-2">
                        <div className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                            Effect Size (Cohen&apos;s d)
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            {effectSize !== null && (isPositive ? (
                                <TrendingUp className="h-8 w-8 text-[var(--color-teal)]" />
                            ) : (
                                <TrendingDown className="h-8 w-8 text-[var(--color-coral)]" />
                            ))}
                            <span className={`${effectSize === null ? 'text-2xl text-[var(--color-text-secondary)]' : `text-5xl ${isPositive ? 'text-[var(--color-teal)]' : 'text-[var(--color-coral)]'}`} font-black`}>
                                {effectSize === null ? 'Not estimable' : `${effectSize > 0 ? '+' : ''}${effectSize.toFixed(2)}`}
                            </span>
                        </div>
                        <div className="text-sm text-[var(--color-text-secondary)] ">
                            {effectSize === null ? 'Requires two conditions A/B, at least two observations each and positive pooled variance.' : `${Math.abs(effectSize) > 0.8 ? 'Large' : Math.abs(effectSize) > 0.5 ? 'Medium' : 'Small'} effect`}
                        </div>
                    </div>

                    {/* Condition Comparison */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--color-border)] ">
                        <div className="text-center">
                            <div className="text-sm text-[var(--color-text-secondary)] mb-1">Condition A (n={condA.length})</div>
                            <div className="text-2xl font-bold text-[var(--color-text-primary)] ">
                                {condA.length ? condAMean.toFixed(2) : '—'}
                            </div>
                            <div className="text-xs text-[var(--color-text-tertiary)]">{condA.length >= 2 ? `±${std(condA).toFixed(2)}` : 'SD unavailable'}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-sm text-[var(--color-text-secondary)] mb-1">Condition B (n={condB.length})</div>
                            <div className="text-2xl font-bold text-[var(--color-text-primary)] ">
                                {condB.length ? condBMean.toFixed(2) : '—'}
                            </div>
                            <div className="text-xs text-[var(--color-text-tertiary)]">{condB.length >= 2 ? `±${std(condB).toFixed(2)}` : 'SD unavailable'}</div>
                        </div>
                    </div>

                    {/* Rigor Score */}
                    <div className="pt-4 border-t border-[var(--color-border)] ">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-[var(--color-text-secondary)]">Scientific Rigor</div>
                            <div className="flex items-center gap-2">
                                <span className={`text-2xl font-bold ${getRigorGradeColor(rigor.grade)}`}>
                                    {rigor.grade}
                                </span>
                                <span className="text-sm text-[var(--color-text-tertiary)]">({rigor.score}/100)</span>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Verification Badge */}
                {hasAttestation && (
                    <a
                        href={getAttestationExplorerUrl(anchored!.uid!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 p-4 rounded-[var(--radius-card)] bg-[var(--color-teal)]/10 border border-[var(--color-teal)]/40 text-[var(--color-teal)] hover:bg-[var(--color-teal)]/15 transition-colors"
                    >
                        <ShieldCheck className="h-5 w-5" />
                        <span className="font-medium">Content hash recorded on Base; finding not validated</span>
                        <ExternalLink className="h-4 w-4" />
                    </a>
                )}

                {/* Footer */}
                <div className="text-center text-sm text-[var(--color-text-secondary)]">
                    <p>Experiment tracked with <a href="https://datalyst.one" className="text-[var(--color-violet)] hover:underline">Datalyst</a></p>
                    <p className="text-xs mt-1">
                        {experiment.startDate} → {experiment.endDate}
                    </p>
                </div>
            </div>
        </div>
    );
}
