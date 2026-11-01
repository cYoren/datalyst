'use client';

import React, { useState } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import Link from 'next/link';
import useSWR from 'swr';
import { Card } from '@/components/ui/Card';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { FlaskConical, Plus, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import CorrelationMatrix from '@/components/lab/CorrelationMatrix';
import { fetcher } from '@/lib/hooks';

interface Experiment {
    id: string;
    name: string;
    hypothesis: string | null;
    startDate: string;
    endDate: string;
    status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
    independent: { id: string; name: string; icon: string; color: string };
    dependent: { id: string; name: string; icon: string; color: string };
}



const statusColors: Record<string, string> = {
    PLANNING: 'bg-[var(--color-amber)]/15 text-[var(--color-amber)]',
    ACTIVE: 'bg-[var(--color-teal)]/15 text-[var(--color-teal)]',
    COMPLETED: 'bg-[var(--color-violet)]/15 text-[var(--color-violet)]',
    ARCHIVED: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
};

const statusLabels: Record<string, string> = {
    PLANNING: 'Planning',
    ACTIVE: 'Active',
    COMPLETED: 'Completed',
    ARCHIVED: 'Archived',
};

export default function LabPage() {
    const { data: experiments, isLoading, error } = useSWR<Experiment[]>('/api/experiments', fetcher, {
        keepPreviousData: true,
        dedupingInterval: 120000,
    });
    const [statusFilter, setStatusFilter] = useState<string | null>(null);

    const experimentsList = Array.isArray(experiments) ? experiments : [];
    const filteredExperiments = experimentsList.filter(exp => {
        if (statusFilter === null) return exp.status !== 'ARCHIVED';
        return exp.status === statusFilter;
    });

    const activeCount = experimentsList.filter(e => e.status === 'ACTIVE').length;
    const completedCount = experimentsList.filter(e => e.status === 'COMPLETED').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">The Lab</h1>
                        <p className="text-sm text-[var(--text-secondary)]">
                            Test correlations between your protocols
                        </p>
                    </div>
                </div>
                <Link href="/lab/new" className={cn(buttonVariants(), "gap-2")}>
                    <Plus className="h-4 w-4" />
                    New Experiment
                </Link>
            </div>

            {/* Explainer Banner */}
            <Link href="/lab/studies" className="block border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 rounded-[var(--radius-card)]">
                <span className="font-medium text-[var(--text-primary)]">Researcher studies →</span>
                <span className="block mt-1 text-sm text-[var(--text-secondary)]">Run AI-assisted protocols with consent, participant schedules and pseudonymous evidence exports.</span>
            </Link>
            <Card className="p-4 border border-[var(--color-border)] bg-[var(--color-bg-subtle)] ">
                <p className="text-sm text-[var(--text-secondary)]">
                    The Lab lets you test specific interventions with randomized experiments. Your Dashboard shows automatic correlations from your data. The Lab goes further by controlling variables to prove causation.
                </p>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center paper-lift  border border-[var(--color-border)]">
                    <div className="text-2xl font-bold font-display text-[var(--color-violet)]">{experimentsList.length}</div>
                    <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Total</div>
                </Card>
                <Card className="p-4 text-center paper-lift  border border-[var(--color-border)]">
                    <div className="text-2xl font-bold font-display text-[var(--color-teal)]">{activeCount}</div>
                    <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Active</div>
                </Card>
                <Card className="p-4 text-center paper-lift  border border-[var(--color-border)]">
                    <div className="text-2xl font-bold font-display text-[var(--color-violet)]">{completedCount}</div>
                    <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Completed</div>
                </Card>
                <Card className="p-4 text-center cursor-pointer hover:bg-[var(--color-bg-subtle)] paper-lift  border border-[var(--color-border)] transition-colors" onClick={() => setStatusFilter(statusFilter === 'ARCHIVED' ? null : 'ARCHIVED')}>
                    <div className="text-2xl font-bold font-display text-[var(--text-secondary)]">
                        {experimentsList.filter(e => e.status === 'ARCHIVED').length}
                    </div>
                    <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mt-1">Archived</div>
                </Card>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {['ALL', 'PLANNING', 'ACTIVE', 'COMPLETED'].map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status === 'ALL' ? null : status)}
                        className={cn(
                            "px-4 py-2 min-h-[44px] rounded-[var(--radius-card)] text-sm font-medium transition-all",
                            (status === 'ALL' && statusFilter === null) || status === statusFilter
                                ? "bg-[var(--color-violet)]/15 text-[var(--color-violet)]"
                                : "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"
                        )}
                    >
                        {status === 'ALL' ? 'All Active' : statusLabels[status]}
                    </button>
                ))}
            </div>

            {/* Experiments List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-violet)]" />
                </div>
            ) : error ? (
                <Card className="p-8 text-center border border-[var(--color-border)]">
                    <p className="text-[var(--color-coral)]">Failed to load experiments</p>
                </Card>
            ) : filteredExperiments.length === 0 ? (
                <div className="space-y-6">
                    <Card className="p-8 text-center border border-[var(--color-border)]  paper-lift">
                        <FlaskConical className="h-12 w-12 mx-auto text-[var(--text-tertiary)] opacity-50 mb-4" />
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2 font-display">
                            Start Your First Experiment
                        </h3>
                        <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                            Test what actually works for you. Pick a cause and effect, and we&apos;ll randomize your days and run the statistics.
                        </p>
                        <Link href="/lab/new" className={cn(buttonVariants(), "gap-2")}>
                            <Plus className="h-4 w-4" />
                            Create Custom Experiment
                        </Link>
                    </Card>

                    {/* Popular Starter Experiments */}
                    <div>
                        <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-4">
                            Popular first experiments
                        </h3>
                        <div className="grid gap-3 md:grid-cols-3">
                            <Card className="p-4 paper-lift  border border-[var(--color-border)] hover:border-[var(--color-violet)]/40 hover:bg-[var(--color-violet)]/20 transition-colors cursor-pointer group">
                                <Link href="/lab/new?template=caffeine" className="block">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="h-10 w-10 flex items-center justify-center bg-[var(--color-violet)]/15 rounded-[var(--radius-button)]"><TrackerIcon value="coffee" className="h-5 w-5" /></div>
                                        <div>
                                            <div className="font-semibold font-display text-[var(--text-primary)] group-hover:text-[var(--color-violet)] transition-colors">
                                                Caffeine → Focus
                                            </div>
                                            <div className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">14 days</div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mt-3">
                                        Does coffee actually help you focus? Find out with a randomized test.
                                    </p>
                                </Link>
                            </Card>

                            <Card className="p-4 paper-lift  border border-[var(--color-border)] hover:border-[var(--color-violet)]/40 hover:bg-[var(--color-violet)]/20 transition-colors cursor-pointer group">
                                <Link href="/lab/new?template=sleep" className="block">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="h-10 w-10 flex items-center justify-center bg-[var(--color-violet)]/15 rounded-[var(--radius-button)]"><TrackerIcon value="moon" className="h-5 w-5" /></div>
                                        <div>
                                            <div className="font-semibold font-display text-[var(--text-primary)] group-hover:text-[var(--color-violet)] transition-colors">
                                                Sleep Duration → Mood
                                            </div>
                                            <div className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">21 days</div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mt-3">
                                        Test if more sleep actually improves your daily mood.
                                    </p>
                                </Link>
                            </Card>

                            <Card className="p-4 paper-lift  border border-[var(--color-border)] hover:border-[var(--color-teal)]/40 hover:bg-[var(--color-teal)]/20 transition-colors cursor-pointer group">
                                <Link href="/lab/new?template=exercise" className="block">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="h-10 w-10 flex items-center justify-center bg-[var(--color-teal)]/15 rounded-[var(--radius-button)]"><TrackerIcon value="activity" className="h-5 w-5" /></div>
                                        <div>
                                            <div className="font-semibold font-display text-[var(--text-primary)] group-hover:text-[var(--color-teal)] transition-colors">
                                                Exercise → Energy
                                            </div>
                                            <div className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">14 days</div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mt-3">
                                        Does working out boost your energy levels the next day?
                                    </p>
                                </Link>
                            </Card>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredExperiments.map(exp => (
                        <ExperimentCard key={exp.id} experiment={exp} />
                    ))}
                </div>
            )}

            {/* Correlation Matrix */}
            <Card className="p-6 paper-lift shadow-[var(--shadow-card)] border border-[var(--color-border)]">
                <h2 className="text-lg font-semibold font-display text-[var(--text-primary)] mb-1">
                    Correlation overview
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                    Based on the last 30 days of data. Click any cell to explore that correlation.
                </p>
                <div className="border border-[var(--color-border)] rounded-[var(--radius-card)] overflow-hidden">
                    <CorrelationMatrix />
                </div>
            </Card>
        </div>
    );
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
    const daysLeft = Math.ceil(
        (new Date(experiment.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    const isEnded = daysLeft < 0;

    return (
        <Card className="p-5 paper-lift  border border-[var(--color-border)] transition-all cursor-pointer group" onClick={() => window.location.href = `/lab/${experiment.id}`}>
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    {/* Status Badge */}
                    <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3",
                        statusColors[experiment.status]
                    )}>
                        {statusLabels[experiment.status]}
                    </span>

                    {/* Title */}
                    <h3 className="text-lg font-semibold font-display text-[var(--text-primary)] mb-1 group-hover:text-[var(--color-accent)] transition-colors">
                        {experiment.name}
                    </h3>

                    {/* Variables */}
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-3">
                        <span className="flex items-center gap-1">
                            <TrackerIcon value={experiment.independent.icon} className="inline h-4 w-4 -mt-0.5 mr-1" />{experiment.independent.name}
                        </span>
                        <span className="text-[var(--color-text-tertiary)]">→</span>
                        <span className="flex items-center gap-1">
                            <TrackerIcon value={experiment.dependent.icon} className="inline h-4 w-4 -mt-0.5 mr-1" />{experiment.dependent.name}
                        </span>
                    </div>

                    {/* Hypothesis */}
                    {experiment.hypothesis && (
                        <p className="text-sm text-[var(--text-tertiary)] italic line-clamp-2 mb-3">
                            &quot;{experiment.hypothesis}&quot;
                        </p>
                    )}

                    {/* Date Range */}
                    <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {experiment.startDate} → {experiment.endDate}
                        </span>
                        {experiment.status === 'ACTIVE' && !isEnded && (
                            <span className="text-[var(--color-teal)] font-medium">
                                {daysLeft} days left
                            </span>
                        )}
                        {experiment.status === 'ACTIVE' && isEnded && (
                            <span className="text-[var(--color-amber)] font-medium">
                                Ended - ready for analysis
                            </span>
                        )}
                    </div>
                </div>

                {/* View Results Button */}
                {(experiment.status === 'ACTIVE' || experiment.status === 'COMPLETED') && (
                    <Button variant="ghost" size="sm" className="gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <TrendingUp className="h-4 w-4" />
                        Results
                    </Button>
                )}
            </div>
        </Card>
    );
}
