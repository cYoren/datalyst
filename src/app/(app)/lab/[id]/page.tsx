'use client';

import React, { use, useState } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { FlaskConical, ArrowLeft, Play, Archive, Loader2, Download, ShieldCheck, ChevronDown, AlertTriangle, TrendingUp } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/Tooltip';
import ExperimentChart from '@/components/lab/ExperimentChart';
import { exportRawData } from '@/stats/analysis';
import { fetcher } from '@/lib/hooks';
import ExperimentProofs from '@/components/lab/ExperimentProofs';

interface ExperimentResults {
    // For gated results (ACTIVE experiments)
    gated?: boolean;
    message?: string;
    progress?: {
        totalDays: number;
        loggedDays: number;
        complianceRate: number;
        daysRemaining: number;
    };
    experiment: {
        id: string;
        name: string;
        status: string;
        startDate: string;
        endDate: string;
        type?: string;
        randomizationType?: string;
        washoutPeriod?: number;
        blockSize?: number;
        isBlind?: boolean;
        hypothesis?: string;
        hypothesisLockedAt?: string;
        isPublic?: boolean;
        slug?: string | null;
    };
    independent?: {
        name: string;
        icon: string;
        variable: string;
        unit: string;
    };
    dependent?: {
        name: string;
        icon: string;
        variable: string;
        unit: string;
    };
    chartData?: {
        date: string;
        independent: number | null;
        dependent: number | null;
        isWashout: boolean;
        condition: string | null;
    }[];
    stats?: {
        totalDays: number;
        loggedDays: number;
        correlation: number | null;
        correlationType: 'pearson' | 'spearman';
        strength: string;
        conditionLabels?: string[];
        n1?: {
            conditionAMean: number;
            conditionBMean: number;
            conditionAStd: number;
            conditionBStd: number;
            nA: number;
            nB: number;
            effectSize: number;
            effectLabel: string;
            tTest: { tStatistic: number; pValue: number; significant: boolean } | null;
            bayesian: {
                probabilityOfEffect: number;
                posteriorMean: number;
                posteriorStd: number;
                credibleInterval: [number, number];
            };
            autocorrelation: {
                lag1: number;
                isProblematic: boolean;
                warning: string | null;
            };
            blockAnalysis?: {
                nBlocks: number;
                meanBlockDiff: number;
                tTest: { tStatistic: number; pValue: number; significant: boolean } | null;
                effectSize: number;
                missingDataWarning: string | null;
            } | null;
            carryoverTest?: {
                hasCarryover: boolean;
                warning: string | null;
            } | null;
            periodEffect?: {
                earlyMeanDiff: number;
                lateMeanDiff: number;
                hasPeriodEffect: boolean;
                warning: string | null;
            } | null;
            sequentialBoundary?: {
                currentZ: number;
                criticalValue: number;
                alphaSpent: number;
                dataFraction: number;
                nLooks: number;
                canRejectNull: boolean;
                canStopForFutility: boolean;
            } | null;
        };
        multiArm?: {
            nConditions: number;
            conditionStats: { label: string; mean: number; std: number; n: number; dose?: number }[];
            kruskalWallis: { H: number; pValue: number; significant: boolean } | null;
            pairwiseComparisons: { conditionA: string; conditionB: string; meanDiff: number; pValue: number; significant: boolean }[];
            doseResponse: {
                slope: number;
                intercept: number;
                r2: number;
                pValue: number;
                optimalDose: number | null;
            } | null;
        } | null;
        interpretation?: {
            headline: string;
            effectDescription: string;
            confidenceStatement: string;
            magnitude: 'negligible' | 'small' | 'moderate' | 'large' | 'very_large';
            recommendation: string;
            nextSteps: string[];
        };
    };
}



function DataQualitySection({ stats, experiment }: { stats: ExperimentResults['stats']; experiment: ExperimentResults['experiment'] }) {
    const [expanded, setExpanded] = useState(false);
    if (!stats) return null;
    const n1 = stats.n1;
    if (!n1) return null;

    // Collect all active warnings
    const warnings: { label: string; detail: string; severity: 'red' | 'orange' | 'amber' }[] = [];

    if (n1.carryoverTest?.hasCarryover) {
        warnings.push({ label: 'Carryover effect', detail: n1.carryoverTest.warning!, severity: 'red' });
    }
    if (n1.periodEffect?.hasPeriodEffect) {
        warnings.push({ label: 'Period effect', detail: n1.periodEffect.warning!, severity: 'orange' });
    }
    if (n1.autocorrelation.isProblematic) {
        warnings.push({
            label: 'Autocorrelation',
            detail: `Day-to-day drift detected (lag-1: ${n1.autocorrelation.lag1.toFixed(2)}). Results may reflect a trend rather than your intervention.`,
            severity: 'amber',
        });
    }

    const hasSequential = n1.sequentialBoundary && experiment.status === 'ACTIVE';
    const hasBlockAnalysis = !!n1.blockAnalysis;
    const hasAnything = warnings.length > 0 || hasSequential || hasBlockAnalysis;

    if (!hasAnything) return null;

    // Summary line
    const allClear = warnings.length === 0;
    const summaryColor = allClear ? 'text-[var(--color-teal)]' : warnings.some(w => w.severity === 'red') ? 'text-[var(--color-coral)]' : 'text-[var(--color-amber)]';
    const summaryBg = allClear ? 'bg-[var(--color-teal)]/10 border-[var(--color-teal)]/40' : warnings.some(w => w.severity === 'red') ? 'bg-[var(--color-coral)]/10 border-[var(--color-coral)]/40' : 'bg-[var(--color-amber)]/10 border-[var(--color-amber)]/40';
    const summary = allClear
        ? 'No issues detected'
        : `${warnings.length} issue${warnings.length > 1 ? 's' : ''} found`;

    return (
        <Card className={cn('animate-fade-in overflow-hidden border', summaryBg)}>
            {/* Clickable header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-2.5">
                    <AlertTriangle className={cn('h-4 w-4', summaryColor)} />
                    <span className={cn('text-sm font-semibold', summaryColor)}>
                        Data Quality: {summary}
                    </span>
                    {hasSequential && n1.sequentialBoundary!.canRejectNull && (
                        <span className="text-xs font-medium text-[var(--color-teal)] bg-[var(--color-teal)]/15 px-2 py-0.5 rounded-full">
                            Early stopping possible
                        </span>
                    )}
                </div>
                <ChevronDown className={cn(
                    'h-4 w-4 transition-transform text-[var(--text-tertiary)]',
                    expanded && 'rotate-180'
                )} />
            </button>

            {/* Expanded details */}
            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)]">
                    {/* Warnings */}
                    {warnings.map((w, i) => (
                        <div key={i} className="flex gap-2 items-start pt-3 first:pt-3">
                            <span className={cn(
                                'mt-0.5 h-2 w-2 rounded-full shrink-0',
                                w.severity === 'red' ? 'bg-[var(--color-coral)]' : w.severity === 'orange' ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-amber)]'
                            )} />
                            <div>
                                <span className="text-xs font-semibold text-[var(--text-primary)]">{w.label}: </span>
                                <span className="text-xs text-[var(--text-secondary)]">{w.detail}</span>
                            </div>
                        </div>
                    ))}

                    {/* Sequential testing */}
                    {hasSequential && (
                        <div className="flex gap-2 items-start pt-3">
                            <span className={cn(
                                'mt-0.5 h-2 w-2 rounded-full shrink-0',
                                n1.sequentialBoundary!.canRejectNull ? 'bg-[var(--color-teal)]' : 'bg-[var(--color-violet)]'
                            )} />
                            <div>
                                <span className="text-xs font-semibold text-[var(--text-primary)]">Interim analysis: </span>
                                <span className="text-xs text-[var(--text-secondary)]">
                                    {n1.sequentialBoundary!.canRejectNull
                                        ? 'Effect crossed the significance boundary. You may stop early.'
                                        : `${(n1.sequentialBoundary!.dataFraction * 100).toFixed(0)}% of data collected. Continue gathering data.`
                                    }
                                    {n1.sequentialBoundary!.canStopForFutility && ' Effect is very small. Consider stopping for futility.'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Block analysis */}
                    {hasBlockAnalysis && (
                        <div className="pt-3 border-t border-[var(--color-border)]">
                            <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Block Analysis</div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                    <div className="text-[var(--text-tertiary)]">Blocks</div>
                                    <div className="font-bold text-[var(--text-primary)]">{n1.blockAnalysis!.nBlocks}</div>
                                </div>
                                <div>
                                    <div className="text-[var(--text-tertiary)]">Mean diff</div>
                                    <div className="font-bold text-[var(--text-primary)]">{n1.blockAnalysis!.meanBlockDiff.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[var(--text-tertiary)]">Block p-value</div>
                                    <div className="font-bold text-[var(--text-primary)]">
                                        {n1.blockAnalysis!.tTest ? n1.blockAnalysis!.tTest.pValue.toFixed(3) : 'N/A'}
                                    </div>
                                </div>
                            </div>
                            {n1.blockAnalysis!.missingDataWarning && (
                                <p className="text-[10px] text-[var(--color-amber)] mt-1.5">{n1.blockAnalysis!.missingDataWarning}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function ExperimentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [lifecycleError, setLifecycleError] = useState('');
    const [sharing, setSharing] = useState(false);
    const [shareMessage, setShareMessage] = useState('');

    const { data: results, isLoading, error, mutate } = useSWR<ExperimentResults>(
        `/api/experiments/${id}/results`,
        fetcher,
        {
            keepPreviousData: true,
            dedupingInterval: 120000,
        }
    );

    const handleStatusChange = async (newStatus: string) => {
        try {
            setLifecycleError('');
            const response = await fetch(`/api/experiments/${id}${newStatus === 'COMPLETED' ? '/complete' : ''}`, {
                method: newStatus === 'COMPLETED' ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || 'Failed to update experiment'); }
            mutate();
        } catch (err) {
            setLifecycleError(err instanceof Error ? err.message : 'Failed to update experiment');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-violet)]" />
            </div>
        );
    }

    if (error || !results) {
        return (
            <Card className="p-8 text-center">
                <p className="text-[var(--color-coral)] mb-4">Failed to load experiment results</p>
                <Button variant="secondary" onClick={() => router.back()}>
                    Go Back
                </Button>
            </Card>
        );
    }

    const { experiment, independent, dependent, chartData, stats } = results;

    // ========== GATED RESULTS UI ==========
    // For ACTIVE experiments, show progress instead of full stats
    if (results.gated) {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4 min-w-0">
                    <Button variant="ghost" size="sm" aria-label="Back to Lab" onClick={() => router.push('/lab')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-[var(--radius-card)] border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)]">
                            <FlaskConical className="h-5 w-5 text-[var(--color-accent)]" />
                        </div>
                        <div className="min-w-0 break-words">
                            <h1 className="text-xl font-bold text-[var(--text-primary)]">
                                {experiment.name}
                            </h1>
                            <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-violet)]/15 text-[var(--color-violet)] ">
                                In Progress
                            </span>
                        </div>
                    </div>
                </div>

                {/* Gated Message */}
                {lifecycleError && <p role="alert" className="text-sm text-[var(--color-error)]">{lifecycleError}</p>}
                <ExperimentProofs id={id} />
                <Card className="p-6 border border-[var(--color-amber)]/40 bg-[var(--color-amber)]/10 paper-lift">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-full bg-[var(--color-amber)]/15 ">
                            <AlertTriangle className="h-6 w-6 text-[var(--color-amber)] " />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--color-amber)] ">
                                Results Locked Until Completion
                            </h2>
                            <p className="text-sm text-[var(--color-amber)] mt-1">
                                {results.message || 'To maintain scientific rigor, statistical results are hidden while the experiment is active. This prevents peeking bias which can invalidate your N=1 study.'}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Progress Card */}
                <Card className="p-6 paper-lift shadow-[var(--shadow-card)] border border-[var(--color-border)]">
                    <h3 className="text-lg font-semibold font-display text-[var(--text-primary)] mb-4">
                        Experiment Progress
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 rounded-[var(--radius-card)] bg-[var(--bg-secondary)]">
                            <div className="text-2xl font-bold text-[var(--text-primary)]">
                                {results.progress?.loggedDays || 0}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">Days Logged</div>
                        </div>
                        <div className="text-center p-4 rounded-[var(--radius-card)] bg-[var(--bg-secondary)]">
                            <div className="text-2xl font-bold text-[var(--text-primary)]">
                                {results.progress?.totalDays || 0}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">Total Days</div>
                        </div>
                        <div className="text-center p-4 rounded-[var(--radius-card)] bg-[var(--bg-secondary)]">
                            <div className="text-2xl font-bold text-[var(--color-teal)]">
                                {results.progress?.complianceRate || 0}%
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">Compliance</div>
                        </div>
                        <div className="text-center p-4 rounded-[var(--radius-card)] bg-[var(--bg-secondary)]">
                            <div className="text-2xl font-bold text-[var(--color-violet)]">
                                {results.progress?.daysRemaining || 0}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">Days Left</div>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[var(--color-violet)] transition-all duration-300"
                                style={{ width: `${results.progress?.complianceRate || 0}%` }}
                            />
                        </div>
                    </div>
                </Card>

                <div className="text-center">
                    <Button onClick={() => handleStatusChange('COMPLETED')} className="mb-3">Complete and freeze results</Button>
                    <p className="mb-4 text-xs text-[var(--color-text-secondary)]">Completion is final. Later tracker edits will not change the frozen research record.</p>
                    <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                        Return to Dashboard
                    </Button>
                </div>
            </div>
        );
    }
    // ========== END GATED RESULTS UI ==========

    // Guard: ensure all required data is present (not gated means completed experiment)
    if (!stats || !independent || !dependent || !chartData) {
        return (
            <Card className="p-8 text-center">
                <p className="text-[var(--color-coral)] mb-4">Incomplete experiment data</p>
                <Button variant="secondary" onClick={() => router.back()}>
                    Go Back
                </Button>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1 basis-64">
                    <Button variant="ghost" size="sm" aria-label="Back to Lab" onClick={() => router.push('/lab')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-[var(--radius-card)] border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)]">
                            <FlaskConical className="h-5 w-5 text-[var(--color-accent)]" />
                        </div>
                        <div className="min-w-0 break-words">
                            <h1 className="text-xl font-bold text-[var(--text-primary)]">
                                {experiment.name}
                            </h1>
                            <p className="text-sm text-[var(--text-secondary)]">
                                <TrackerIcon value={independent.icon} className="inline h-4 w-4 -mt-0.5 mr-1" />{independent.name} → <TrackerIcon value={dependent.icon} className="inline h-4 w-4 -mt-0.5 mr-1" />{dependent.name}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Status & Export Actions */}
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            const outcomeByDate: Record<string, number> = {};
                            chartData.forEach((d) => {
                                if (d.dependent !== null) outcomeByDate[d.date] = d.dependent;
                            });
                            // Transform chartData to ensure condition is a string for exportRawData
                            const exportData = chartData.map((d) => ({
                                date: d.date,
                                condition: d.condition || 'N/A',
                                isWashout: d.isWashout
                            }));
                            const csv = exportRawData(exportData, outcomeByDate);
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${experiment.name.replace(/\s+/g, '_')}_data.csv`;
                            a.click();
                        }}
                        className="gap-2 text-[var(--text-secondary)]" title="Export Raw Data"
                    >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Export CSV</span>
                    </Button>

                    <Button
                        variant="ghost"
                        className="gap-2 text-[var(--color-violet)] hover:text-[var(--color-violet)] hover:bg-[var(--color-violet)]/10"
                        onClick={async () => {
                            if (experiment.status === 'ACTIVE' || experiment.status === 'PLANNING') {
                                alert('Audit reports are available after your experiment completes. This ensures results aren\'t biased by early analysis.');
                                return;
                            }
                            try {
                                const res = await fetch(`/api/experiments/${experiment.id}/audit`);
                                if (!res.ok) {
                                    const data = await res.json();
                                    alert(data.message || 'Failed to generate audit report');
                                    return;
                                }
                                const auditData = await res.json();
                                const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${experiment.name.replace(/\s+/g, '_')}_audit.json`;
                                a.click();
                            } catch (err) {
                                console.error('Failed to export audit:', err);
                                alert('Failed to generate audit report');
                            }
                        }}
                        title="Export comprehensive audit report for transparency and reproducibility"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        <span className="hidden sm:inline">Export Audit</span>
                    </Button>

                    {experiment.status === 'PLANNING' && (
                        <Button onClick={() => handleStatusChange('ACTIVE')} className="gap-2">
                            <Play className="h-4 w-4" />
                            Start Experiment
                        </Button>
                    )}
                    {experiment.status === 'ACTIVE' && (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                const reason = prompt('Why are you dropping out of this experiment?');
                                if (reason) {
                                    handleStatusChange('ARCHIVED');
                                }
                            }}
                            className="gap-2 text-[var(--color-coral)] hover:text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                        >
                            <Archive className="h-4 w-4" />
                            Drop Out
                        </Button>
                    )}
                    {experiment.status !== 'ARCHIVED' && experiment.status !== 'ACTIVE' && (
                        <Button variant="ghost" onClick={() => handleStatusChange('ARCHIVED')} className="gap-2 text-[var(--color-text-secondary)]">
                            <Archive className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {lifecycleError && <p role="alert" className="text-sm text-[var(--color-error)]">{lifecycleError}</p>}
            <ExperimentProofs id={id} />
            {/* ========== INTERPRETATION CARD (Plain English Results) ========== */}
            {stats.interpretation && (
                <Card className={cn(
                    "p-6 border border-[var(--color-border)] shadow-[var(--shadow-card)] paper-lift animate-fade-in",
                    stats.interpretation.magnitude === 'negligible' ? 'border-b-4 border-b-[var(--color-border-hover)] bg-[var(--color-bg-subtle)]/50 ' :
                        stats.interpretation.magnitude === 'small' ? 'border-b-4 border-b-[var(--color-violet)] bg-[var(--color-violet)]/10 ' :
                            stats.interpretation.magnitude === 'moderate' ? 'border-b-4 border-b-[var(--color-teal)] bg-[var(--color-teal)]/10 ' :
                                'border-b-4 border-b-[var(--color-violet)] bg-[var(--color-violet)]/10 '
                )}>
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                                {stats.interpretation.headline}
                            </h2>
                            <p className="text-[var(--text-secondary)] mb-3">
                                {stats.interpretation.effectDescription}
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)] mb-4">
                                {stats.interpretation.confidenceStatement}
                            </p>

                            {/* Recommendation */}
                            <div className="p-3 rounded-[var(--radius-card)] bg-[var(--bg-secondary)] mb-4">
                                <div className="text-sm font-medium text-[var(--text-primary)]">
                                    {stats.interpretation.recommendation}
                                </div>
                            </div>

                            {/* Next Steps */}
                            {stats.interpretation.nextSteps.length > 0 && (
                                <div className="mb-4">
                                    <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
                                        What to do next
                                    </div>
                                    <ul className="space-y-1">
                                        {stats.interpretation.nextSteps.map((step, i) => (
                                            <li key={i} className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                                                <span className="text-[var(--color-teal)]">→</span> {step}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Action Buttons for Completed Experiments */}
                            {experiment.status === 'COMPLETED' && (
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-color)]">
                                    <Link
                                        href={`/lab/new?followup=${experiment.id}&independent=${encodeURIComponent(independent.name)}&dependent=${encodeURIComponent(dependent.name)}`}
                                        className={cn(buttonVariants({ size: 'sm' }), "gap-2")}
                                    >
                                        <FlaskConical className="h-4 w-4" />
                                        Start Follow-up Experiment
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2"
                                        disabled={sharing}
                                        onClick={async () => {
                                            let slug = experiment.isPublic ? experiment.slug : null;
                                            if (!slug && !confirm('Publish these results publicly? Anyone with the link can view the experiment title, protocol, dates, condition summaries and results. Public copies may remain after you stop sharing.')) return;
                                            setSharing(true); setShareMessage('');
                                            try {
                                                if (!slug) {
                                                    const response = await fetch(`/api/experiments/${id}/sharing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublic: true, confirm: true }) });
                                                    const result = await response.json();
                                                    if (!response.ok) throw new Error(result.error || 'Could not enable public sharing');
                                                    slug = result.slug;
                                                    await mutate();
                                                }
                                                const url = new URL(`/share/${encodeURIComponent(slug!)}`, window.location.origin).href;
                                                if (navigator.share) await navigator.share({ title: experiment.name, url });
                                                else { await navigator.clipboard.writeText(url); setShareMessage('Public results link copied.'); }
                                            } catch (error) {
                                                if (!(error instanceof DOMException && error.name === 'AbortError')) setShareMessage(error instanceof Error ? error.message : 'Could not share results');
                                            } finally { setSharing(false); }
                                        }}
                                    >
                                        <TrendingUp className="h-4 w-4" />
                                        {experiment.isPublic ? 'Share public results' : 'Enable public sharing'}
                                    </Button>
                                    {experiment.isPublic && <Button variant="ghost" size="sm" disabled={sharing} onClick={async () => {
                                        setSharing(true); setShareMessage('');
                                        try {
                                            const response = await fetch(`/api/experiments/${id}/sharing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublic: false }) });
                                            if (!response.ok) throw new Error('Could not stop public sharing');
                                            await mutate(); setShareMessage('Public sharing stopped. Existing copies cannot be recalled.');
                                        } catch (error) { setShareMessage(error instanceof Error ? error.message : 'Could not stop sharing'); } finally { setSharing(false); }
                                    }}>Stop public sharing</Button>}
                                    {experiment.isPublic && experiment.slug && <Link className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-[var(--color-accent)]')} href={`/share/${encodeURIComponent(experiment.slug)}`} target="_blank" rel="noreferrer">View public results</Link>}
                                    {shareMessage && <p className="w-full text-sm text-[var(--text-secondary)]" role="status">{shareMessage}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* Multi-arm analysis results */}
            {stats.multiArm && (
                <Card className="p-6 border-l-4 border-l-[var(--color-violet)] bg-[var(--color-violet)]/10 animate-fade-in">
                    <div className="flex items-center gap-3 mb-4">
                        <FlaskConical className="h-5 w-5 text-[var(--color-violet)] shrink-0" />
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Multi-Arm Analysis ({stats.multiArm.nConditions} Conditions)</h3>
                    </div>

                    {/* Condition Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {stats.multiArm.conditionStats.map(cs => (
                            <div key={cs.label} className="p-3 rounded-[var(--radius-card)] bg-[var(--bg-secondary)]">
                                <div className="text-sm font-medium text-[var(--text-primary)]">{cs.label}</div>
                                <div className="text-lg font-bold">{cs.mean.toFixed(2)}</div>
                                <div className="text-xs text-[var(--text-tertiary)]">
                                    n={cs.n}, σ={cs.std.toFixed(2)}{cs.dose !== undefined ? `, dose=${cs.dose}` : ''}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Kruskal-Wallis Test */}
                    {stats.multiArm.kruskalWallis && (
                        <div className="p-3 rounded-[var(--radius-card)] bg-[var(--bg-secondary)] mb-3">
                            <div className="text-sm font-medium text-[var(--text-primary)] mb-1">Kruskal-Wallis Test</div>
                            <div className="text-sm text-[var(--text-secondary)]">
                                H = {stats.multiArm.kruskalWallis.H.toFixed(2)}, p = {stats.multiArm.kruskalWallis.pValue.toFixed(4)}
                                <span className={cn('ml-2 px-2 py-0.5 rounded-full text-xs',
                                    stats.multiArm.kruskalWallis.significant
                                        ? 'bg-[var(--color-teal)]/15 text-[var(--color-teal)] '
                                        : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] '
                                )}>
                                    {stats.multiArm.kruskalWallis.significant ? 'Significant' : 'Not Significant'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Pairwise Comparisons */}
                    {stats.multiArm.pairwiseComparisons.length > 0 && (
                        <div className="text-sm">
                            <div className="font-medium text-[var(--text-primary)] mb-1">Pairwise Comparisons (Bonferroni)</div>
                            <div className="space-y-1">
                                {stats.multiArm.pairwiseComparisons.map((pc, i) => (
                                    <div key={i} className="text-[var(--text-secondary)] text-xs">
                                        {pc.conditionA} vs {pc.conditionB}: Δ = {pc.meanDiff.toFixed(2)}, p = {pc.pValue.toFixed(4)}
                                        {pc.significant && <span className="ml-1 text-[var(--color-teal)]">*</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dose-Response */}
                    {stats.multiArm.doseResponse && (
                        <div className="mt-3 p-3 rounded-[var(--radius-card)] bg-[var(--color-violet)]/10 ">
                            <div className="text-sm font-medium text-[var(--text-primary)] mb-1">Dose-Response Regression</div>
                            <div className="text-sm text-[var(--text-secondary)]">
                                Slope: {stats.multiArm.doseResponse.slope.toFixed(3)}, R² = {stats.multiArm.doseResponse.r2.toFixed(3)}
                                {stats.multiArm.doseResponse.optimalDose && (
                                    <span className="ml-2 text-[var(--color-violet)]">Optimal dose: {stats.multiArm.doseResponse.optimalDose}</span>
                                )}
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* Legacy multi-arm pending notice (for backwards compat if multiArm is undefined for old experiments) */}
            {!stats.n1 && !stats.multiArm && (stats.conditionLabels?.length ?? 2) > 2 && (
                <Card className="p-6 border-l-4 border-l-[var(--color-violet)] bg-[var(--color-violet)]/10 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <FlaskConical className="h-5 w-5 text-[var(--color-violet)] shrink-0" />
                        <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Multi-arm analysis</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                                Your {stats.conditionLabels?.length ?? 3}+ condition experiment analysis is processing.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Scientific Analysis Metrics */}
            {stats.n1 && (
                <div className="grid md:grid-cols-3 gap-6 animate-fade-in">
                    {/* Probability of Effect */}
                    <Card className="p-6 space-y-4 border border-[var(--color-violet)]/40 border-b-4 border-b-[var(--color-violet)]  paper-lift overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <FlaskConical className="h-16 w-16 text-[var(--color-violet)]" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                                Probability of Effect
                            </h3>
                            <div className="text-4xl font-black text-[var(--color-violet)] font-display tracking-tight">
                                {(stats.n1.bayesian.probabilityOfEffect * 100).toFixed(1)}%
                            </div>
                            <p className="text-xs text-[var(--text-tertiary)]">
                                Posterior probability of a positive outcome difference under this model
                            </p>
                        </div>
                        <div className="pt-2">
                            <div className="h-1.5 w-full bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-[var(--color-violet)]"
                                    style={{ width: `${stats.n1.bayesian.probabilityOfEffect * 100}%` }}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Effect Size */}
                    <Card className="p-6 space-y-4 border border-[var(--color-violet)]/40 border-b-4 border-b-[var(--color-violet)]  paper-lift">
                        <div className="space-y-1">
                            <h3 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                                Effect Size (d)
                            </h3>
                            <div className="text-4xl font-black text-[var(--color-violet)] font-display tracking-tight">
                                {stats.n1.effectSize.toFixed(2)}
                            </div>
                            <p className="text-xs text-[var(--text-tertiary)]">
                                {Math.abs(stats.n1.effectSize) >= 0.8 ? 'Large' : Math.abs(stats.n1.effectSize) >= 0.5 ? 'Medium' : Math.abs(stats.n1.effectSize) >= 0.2 ? 'Small' : 'Negligible'} standardized difference
                            </p>
                        </div>
                        <div className="text-xs font-medium text-[var(--color-violet)] bg-[var(--color-violet)]/10 px-2 py-1 rounded inline-block">
                            Outcome difference: {stats.n1.bayesian.credibleInterval[0].toFixed(2)} to {stats.n1.bayesian.credibleInterval[1].toFixed(2)} {dependent.unit} (95% credible interval)
                        </div>
                    </Card>

                    {/* Condition Means */}
                    <Card className="p-6 space-y-4 border border-[var(--color-teal)]/40 border-b-4 border-b-[var(--color-teal)]  paper-lift">
                        <div className="space-y-3">
                            <h3 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                                Condition Averages
                            </h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-[var(--text-secondary)] underline decoration-dotted decoration-[var(--border-color)]">
                                        {experiment.isBlind ? 'Condition 2' : (stats.conditionLabels?.[1] ?? 'Target/On')} (n={stats.n1.nB})
                                    </span>
                                    <span className="text-lg font-bold font-display text-[var(--text-primary)] tracking-tight">{stats.n1.conditionBMean.toFixed(2)} <span className="text-sm font-normal text-[var(--text-tertiary)]">{dependent.unit}</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-[var(--text-secondary)] underline decoration-dotted decoration-[var(--border-color)]">
                                        {experiment.isBlind ? 'Condition 1' : (stats.conditionLabels?.[0] ?? 'Baseline/Off')} (n={stats.n1.nA})
                                    </span>
                                    <span className="text-lg font-bold font-display text-[var(--text-primary)] tracking-tight">{stats.n1.conditionAMean.toFixed(2)} <span className="text-sm font-normal text-[var(--text-tertiary)]">{dependent.unit}</span></span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs font-medium text-[var(--color-teal)] bg-[var(--color-teal)]/10 px-2 py-0.5 rounded">
                                    {stats.n1.effectLabel} effect
                                </span>
                                {stats.n1.tTest && (
                                    <span className={cn(
                                        'text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1',
                                        stats.n1.tTest.significant
                                            ? 'text-[var(--color-teal)] bg-[var(--color-teal)]/10'
                                            : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]'
                                    )}>
                                        p = {stats.n1.tTest.pValue.toFixed(3)}
                                        <InfoTooltip text={`Under the null hypothesis and this test's assumptions, p is the probability of a result at least as extreme as observed. It is not the probability that the finding is random or that the hypothesis is true. Your p = ${stats.n1.tTest.pValue.toFixed(3)} ${stats.n1.tTest.significant ? 'crosses' : 'does not cross'} the 0.05 threshold.`} />
                                    </span>
                                )}
                            </div>
                            <div className="pt-1 text-[10px] text-[var(--text-tertiary)] italic">
                                * Excluding washout/adaptation days
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Data Quality: grouped collapsible section */}
            <DataQualitySection stats={stats} experiment={experiment} />

            {/* Chart */}
            <Card className="p-6 border border-[var(--color-border)] shadow-[var(--shadow-card)] paper-lift">
                <h2 className="text-lg font-semibold font-display text-[var(--text-primary)] mb-4">
                    Correlation Analysis
                </h2>

                {stats.loggedDays < 3 ? (
                    <div className="py-12 text-center">
                        <FlaskConical className="h-12 w-12 mx-auto text-[var(--color-text-tertiary)] mb-4" />
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                            Not enough data yet
                        </h3>
                        <p className="text-[var(--text-secondary)]">
                            Log at least 3 days of both variables to see correlation results.
                        </p>
                    </div>
                ) : (
                    <ExperimentChart
                        data={chartData}
                        independentName={independent.variable}
                        independentUnit={independent.unit}
                        dependentName={dependent.variable}
                        dependentUnit={dependent.unit}
                        correlation={stats.correlation}
                        correlationType={stats.correlationType}
                        strength={stats.strength}
                        conditionLabels={stats.conditionLabels}
                        isBlind={experiment.isBlind}
                    />
                )}
            </Card>

            {/* Correlation Disclaimer */}
            <div className="p-4 rounded-[var(--radius-card)] bg-[var(--color-violet)]/10 border border-[var(--color-violet)]/40 text-sm text-[var(--color-violet)]">
                ℹ️ <strong>Remember:</strong> Correlation ≠ Causation. This tool shows patterns, not proof.
                Other factors may influence both variables independently.
            </div>
        </div >
    );
}
