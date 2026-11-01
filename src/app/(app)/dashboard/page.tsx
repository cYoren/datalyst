'use client';

import React, { useEffect, useState } from 'react';
import { AiInsightsPanel } from '@/components/insights/AiInsightsPanel';
import { format } from 'date-fns';

import { HabitCard } from '@/components/habits/HabitCard';
import ActivityCalendar from '@/components/dashboard/ActivityCalendar';
import { TodaysLogWidget } from '@/components/dashboard/TodaysLogWidget';
import { QuickLogBar } from '@/components/dashboard/QuickLogBar';
import { TodayVsAverage } from '@/components/dashboard/TodayVsAverage';
import { ProtocolCommandCenter } from '@/components/dashboard/ProtocolCommandCenter';
import AdHocLogModal from '@/components/dashboard/AdHocLogModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { TrendingUp, ArrowUpRight, Plus, FlaskConical, Sparkles } from 'lucide-react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/lib/hooks';
import { InfoTooltip } from '@/components/ui/Tooltip';
import type { HabitSchedule } from '@/types';

interface DashboardCorrelation {
    variable1: { habit: string };
    variable2: { habit: string };
    text: string;
    pValue: number;
    n: number;
}

function formatP(p: number) {
    return p < 0.001 ? '<0.001' : p.toFixed(3);
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <span className="flex flex-col gap-1">
            <span className="label-mono">{label}</span>
            <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
        </span>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { habits, stats, insights, user, isLoading, refresh: refreshHabits } = useDashboard();
    const [isAdHocModalOpen, setIsAdHocModalOpen] = useState(false);
    const [showInsightCelebration, setShowInsightCelebration] = useState(false);
    const [newInsightText, setNewInsightText] = useState<string | null>(null);
    // Small screens show one insight so the check-in stays near the top.
    const [showAllInsights, setShowAllInsights] = useState(false);
    const [currentDate, setCurrentDate] = useState('');
    const [greeting, setGreeting] = useState('');

    // First-insight celebration + new insight detection
    useEffect(() => {
        if (!insights?.correlations || insights.correlations.length === 0) return;

        const seen = localStorage.getItem('datalyst_insight_celebrated');
        if (!seen) {
            // localStorage is client-only, so this has to run after hydration.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowInsightCelebration(true);
            localStorage.setItem('datalyst_insight_celebrated', '1');
            localStorage.setItem('datalyst_seen_insight_count', String(insights.correlations.length));
            return;
        }

        // Check for new insights since last visit
        const prevCount = parseInt(localStorage.getItem('datalyst_seen_insight_count') || '0', 10);
        if (insights.correlations.length > prevCount) {
            setNewInsightText(insights.correlations[0].text);
            localStorage.setItem('datalyst_seen_insight_count', String(insights.correlations.length));
        }
    }, [insights]);

    useEffect(() => {
        const date = new Date();
        // The device clock, not the server's: set after hydration to avoid a mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentDate(format(date, "EEEE, MMMM do"));

        const hour = date.getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 18) setGreeting('Good afternoon');
        else setGreeting('Good evening');
    }, []);

    const handleTestCorrelation = (corr: DashboardCorrelation) => {
        const habit1 = habits.find(h => h.name === corr.variable1.habit);
        const habit2 = habits.find(h => h.name === corr.variable2.habit);
        const params = new URLSearchParams();
        if (habit1) params.set('independent', habit1.id);
        if (habit2) params.set('dependent', habit2.id);
        router.push(`/lab/new?${params.toString()}`);
    };

    const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

    const isHabitCompleted = (habitId: string) => {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return false;

        let schedule: HabitSchedule = {};
        try {
            schedule = typeof habit.schedule === 'string'
                ? JSON.parse(habit.schedule) as HabitSchedule
                : habit.schedule;
        } catch {
            schedule = typeof habit.schedule === 'string' ? {} : habit.schedule || {};
        }

        const logLimit = schedule.logLimit || 'unlimited';

        if (logLimit === 'unlimited') {
            return false;
        }

        if (logLimit === 'daily') {
            return habit.entries && habit.entries.length > 0;
        }

        return false;
    };

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    const pendingHabits = habits.filter(h => !isHabitCompleted(h.id));
    const completedHabits = habits.filter(h => isHabitCompleted(h.id));

    return (
        <div className="flex flex-col gap-10 sm:gap-12 pb-20">
            {/* Header */}
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
                <div className="min-w-0">
                    <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)] break-words">
                        {greeting}, {userName}.
                    </h1>
                    <p className="mt-2 text-[var(--text-secondary)]" suppressHydrationWarning>{currentDate}</p>
                </div>
                <Button
                    onClick={() => window.location.href = '/habits/new'}
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex"
                >
                    <Plus className="h-4 w-4" />
                    Create tracker
                </Button>
            </header>

            {/* 01 Insights: the product promise is real statistics, so they lead. */}
            {habits.length > 0 && (
                <section aria-labelledby="insights-heading" className="space-y-4 animate-fade-in">
                    <SectionLabel
                        index={1}
                        id="insights-heading"
                        aside={<InfoTooltip text="Correlations are calculated from your logged data. A small p-value means the pattern is unlikely under no association. This is not proof of causation. Run an experiment to find out." />}
                    >
                        Insights
                    </SectionLabel>

                    {newInsightText && (
                        <div className="flex items-center justify-between gap-4 bg-[var(--color-accent-light)] px-4 py-2 rounded-[var(--radius-card)]">
                            <p className="text-sm text-[var(--text-primary)]">
                                <strong className="mr-2 font-semibold text-[var(--color-accent)]">New insight.</strong>
                                {newInsightText}
                            </p>
                            <button
                                onClick={() => setNewInsightText(null)}
                                aria-label="Dismiss new insight"
                                className="h-11 w-11 inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none shrink-0"
                            >
                                &times;
                            </button>
                        </div>
                    )}

                    {insights?.correlations && insights.correlations.length > 0 ? (
                        <div className="grid gap-2 lg:grid-cols-[1.4fr_1fr]">
                            {/* Top insight */}
                            <button
                                type="button"
                                className="group flex flex-col gap-5 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-5 sm:p-7 text-left transition-colors hover:bg-[var(--color-bg-subtle)] lg:row-span-3"
                                onClick={() => handleTestCorrelation(insights.correlations[0])}
                            >
                                <span className="label-mono flex items-center gap-2 text-[var(--color-accent)]">
                                    <TrendingUp className="h-3.5 w-3.5" suppressHydrationWarning />
                                    Strongest signal
                                </span>
                                <span className="font-display text-2xl sm:text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)]">
                                    {insights.correlations[0].text}
                                </span>
                                <span className="mt-auto flex flex-wrap items-end justify-between gap-4">
                                    <span className="flex gap-6">
                                        <Stat label="p-value" value={formatP(insights.correlations[0].pValue)} />
                                        <Stat label="Sample" value={`${insights.correlations[0].n} days`} />
                                    </span>
                                    <span className="label-mono flex items-center gap-1.5 text-[var(--text-primary)] group-hover:text-[var(--color-accent)]">
                                        <FlaskConical className="h-3.5 w-3.5" suppressHydrationWarning />
                                        Run experiment
                                        <ArrowUpRight className="h-3.5 w-3.5" suppressHydrationWarning />
                                    </span>
                                </span>
                            </button>

                            {insights.correlations.slice(1, 4).map((corr: DashboardCorrelation, i: number) => (
                                <button
                                    key={i}
                                    type="button"
                                    className={cn("group flex flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-5 text-left transition-colors hover:bg-[var(--color-bg-subtle)]", !showAllInsights && "max-sm:hidden")}
                                    onClick={() => handleTestCorrelation(corr)}
                                >
                                    <span className="flex items-start justify-between gap-3">
                                        <span className="font-display text-base font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)]">{corr.text}</span>
                                        <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--color-accent)]" suppressHydrationWarning />
                                    </span>
                                    <span className="flex gap-6">
                                        <Stat label="p-value" value={formatP(corr.pValue)} />
                                        <Stat label="Sample" value={`${corr.n} days`} />
                                    </span>
                                </button>
                            ))}
                            {!showAllInsights && insights.correlations.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllInsights(true)}
                                    className="label-mono min-h-11 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] px-5 text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:hidden"
                                >
                                    Show {Math.min(insights.correlations.length, 4) - 1} more {Math.min(insights.correlations.length, 4) - 1 === 1 ? 'signal' : 'signals'}
                                </button>
                            )}
                        </div>
                    ) : (
                        <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-[var(--text-primary)]">
                                    {(stats?.totalLoggingDays || 0) >= 14
                                        ? 'Insights are being calculated'
                                        : 'Building your dataset'}
                                </h3>
                                <p className="text-sm text-[var(--text-secondary)] mt-1">
                                    {(stats?.totalLoggingDays || 0) >= 14
                                        ? 'Correlations will appear once calculated.'
                                        : `${Math.max(0, 14 - (stats?.totalLoggingDays || 0))} more days of check-ins until pattern detection.`}
                                </p>
                            </div>
                            <div className="w-full md:w-56 shrink-0">
                                <div className="label-mono flex justify-between mb-2">
                                    <span>{Math.min(stats?.totalLoggingDays || 0, 14)} / 14 days</span>
                                    <span>{Math.min(Math.round(((stats?.totalLoggingDays || 0) / 14) * 100), 100)}%</span>
                                </div>
                                <div
                                    className="h-1.5 bg-[var(--color-bg-subtle)] overflow-hidden"
                                    role="progressbar"
                                    aria-label="Days until pattern detection"
                                    aria-valuemin={0}
                                    aria-valuemax={14}
                                    aria-valuenow={Math.min(stats?.totalLoggingDays || 0, 14)}
                                >
                                    <div
                                        className="h-full bg-[var(--color-accent)] transition-all duration-500"
                                        style={{ width: `${Math.min(((stats?.totalLoggingDays || 0) / 14) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </Card>
                    )}
                </section>
            )}

            {/* 02 Daily Check-in: the one thing a returning user opens the app for. */}
            <section id="daily-checkin" className="scroll-mt-20 space-y-4">
                {habits.length > 0 && <QuickLogBar />}
                <TodaysLogWidget />
                {habits.length > 0 && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setIsAdHocModalOpen(true)}
                            className="min-h-11 px-2 text-xs font-medium text-[var(--text-secondary)] underline-offset-4 hover:underline hover:text-[var(--color-accent)] transition-colors"
                        >
                            Missed a day? Log another date
                        </button>
                    </div>
                )}
            </section>

            <TodayVsAverage />

            {/* Consistency is context, not the goal: kept, but after the statistics. */}
            {habits.length > 0 && stats && (
                <section aria-labelledby="consistency-heading" className="space-y-4">
                    <SectionLabel index={3} id="consistency-heading">Consistency</SectionLabel>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { label: 'Days checked in', value: String(stats.totalLoggingDays || 0), tip: "Total unique days you've checked in at least once." },
                            { label: `Today (${stats.dailyProgress?.completed ?? 0}/${stats.dailyProgress?.total ?? 0})`, value: `${stats.dailyProgress?.percentage || 0}%` },
                            { label: 'Weekly completion', value: `${stats.weeklyCompletion || 0}%`, tip: 'Percentage of scheduled trackers checked in this week.' },
                            { label: 'This week', value: `${stats.weeklySummary?.daysActive || 0}/7`, tip: 'Number of days this week you logged at least one entry.' },
                        ].map(item => (
                            <div key={item.label} className="min-w-0 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] px-4 py-3">
                                <dt className="label-mono flex items-center gap-1">
                                    {item.label}
                                    {item.tip && <InfoTooltip className="max-sm:hidden" text={item.tip} />}
                                </dt>
                                <dd className="mt-1 font-display text-xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">{item.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            {habits.length > 0 && (
                <ActivityCalendar
                    className="animate-fade-in"
                    onDayClick={(day) => router.push(`/data?date=${day.date}&openEdit=1`)}
                />
            )}

            {/* Experiment Command Center - Optional advanced execution */}
            <ProtocolCommandCenter />
            <AiInsightsPanel />

            {/* Trackers List */}
            <div className="space-y-6 animate-slide-up">
                {habits.length === 0 ? (
                    <div className="text-center py-12 px-6 bg-[var(--color-bg-card)] rounded-[var(--radius-card)]">
                                                <h2 className="text-3xl font-semibold text-[var(--text-primary)] mb-3">
                            Start your first tracker
                        </h2>
                        <p className="text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
                            Trackers can monitor multiple metrics, like Sleep (hours + quality). Check in daily and Datalyst will reveal meaningful patterns.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button
                                onClick={() => window.location.href = '/habits/new'}
                                size="lg"
                                className=""
                            >
                                Create Tracker
                            </Button>
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    try {
                                        await fetch('/api/demo/setup', { method: 'POST' });
                                        refreshHabits();
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                size="lg"
                            >
                                Try Demo Data
                            </Button>
                        </div>

                        <p className="text-xs text-[var(--text-tertiary)] mt-6">
                            Popular starts: Sleep, Workouts, Mood
                        </p>
                    </div>
                ) : (
                    <>
                        <SectionLabel index={4}>Trackers</SectionLabel>
                        {/* Pending */}
                        {pendingHabits.length > 0 && (
                            <div className="grid gap-4">
                                {pendingHabits.map(habit => (
                                    <HabitCard
                                        key={habit.id}
                                        habit={habit}
                                        isCompleted={false}
                                        onRegister={() => {
                                            document.getElementById('daily-checkin')?.scrollIntoView({
                                                behavior: 'smooth',
                                                block: 'start',
                                            });
                                        }}
                                        onArchive={refreshHabits}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Completed */}
                        {completedHabits.length > 0 && (
                            <div className="pt-8">
                                <h3 className="label-mono mb-4">
                                    Completed
                                </h3>
                                <div className="grid gap-4">
                                    {completedHabits.map(habit => (
                                        <HabitCard
                                            key={habit.id}
                                            habit={habit}
                                            isCompleted={true}
                                            onRegister={() => { }}
                                            onArchive={refreshHabits}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                    </>
                )}
            </div>

            {/* Ad-Hoc Log Modal */}
            <AdHocLogModal
                isOpen={isAdHocModalOpen}
                onClose={() => setIsAdHocModalOpen(false)}
                onLogComplete={refreshHabits}
            />

            {/* First-Insight Celebration Modal */}
            <Modal
                isOpen={showInsightCelebration}
                onClose={() => setShowInsightCelebration(false)}
                title="Your first correlation is ready!"
            >
                <div className="space-y-4 text-center">
                    <Sparkles className="mx-auto h-10 w-10 text-[var(--color-accent)]" aria-hidden />
                    <p className="text-[var(--text-secondary)]">
                        You&apos;ve logged enough data for Datalyst to discover patterns.
                        Scroll down to the <strong>Insights</strong> section to see your first correlations.
                    </p>
                    <Button onClick={() => setShowInsightCelebration(false)} className="w-full">
                        See My Insights
                    </Button>
                </div>
            </Modal>


        </div>
    );
}
