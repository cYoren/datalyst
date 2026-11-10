'use client';

import { DataDashboard } from '@/components/data/DataDashboard';
import ActivityCalendar from '@/components/dashboard/ActivityCalendar';
import { Activity, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useDataPage, useUser } from '@/lib/hooks';
import { DataPageSkeleton } from '@/components/ui/Skeleton';
import { useRouter, useSearchParams } from 'next/navigation';

export default function DataPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isLoading: userLoading } = useUser();
    const { habits, entries, isLoading: dataLoading } = useDataPage();

    const isLoading = userLoading || dataLoading;

    if (isLoading) {
        return <DataPageSkeleton />;
    }

    if (habits.length === 0) {
        return (
            <div className="space-y-8 pb-20">
                <header className="animate-fade-in">
                <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">
                    Data
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    Visualize your tracker data in tables and charts.
                </p>
                </header>

                <div className="animate-slide-up border border-dashed border-[var(--color-border)] rounded-[var(--radius-card)] p-12 text-center bg-[var(--color-bg-card)]">
                    <div className="max-w-md mx-auto space-y-6">
                        <div className="h-24 w-24 bg-[var(--color-bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-6">
                            <BarChart3 className="h-10 w-10 text-[var(--text-tertiary)]" suppressHydrationWarning />
                        </div>
                        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                            Your data will appear here
                        </h2>
                        <p className="text-[var(--text-secondary)]">
                            As soon as you start logging your trackers, we&apos;ll generate detailed charts and tables for you to track your progress.
                        </p>

                        {/* Mock Graph Preview */}
                        <div className="mt-8 p-6 bg-[var(--color-bg-page)] rounded-[var(--radius-card)] opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                            <div className="flex items-end justify-between h-32 gap-2">
                                {[40, 70, 45, 90, 60, 80, 95].map((h, i) => (
                                    <div key={i} className="w-full bg-[var(--color-accent)] rounded-t-sm" style={{ height: `${h}%` }}></div>
                                ))}
                            </div>
                            <p className="text-xs text-[var(--text-tertiary)] mt-4 font-mono">Visualization example</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 pb-20">
            <header className="animate-fade-in max-sm:-order-2">
                <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">
                    Data
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    Visualize your tracker progress in tables and charts.
                </p>
                <Link
                    href="/levels"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
                >
                    <Activity className="h-4 w-4" />
                    Levels: what is still in you at bedtime
                </Link>
            </header>

            <ActivityCalendar
                className="animate-fade-in"
                onDayClick={(day) => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('date', day.date);
                    params.set('openEdit', '1');
                    router.replace(`/data?${params.toString()}`);
                }}
            />

            {/* On phones the chart comes before the calendar. */}
            <div className="animate-slide-up max-sm:-order-1">
                <DataDashboard
                    key={`${searchParams.get('date') || 'all'}-${searchParams.get('openEdit') || '0'}`}
                    habits={habits}
                    entries={entries}
                    focusDate={searchParams.get('date')}
                    openEditOnLoad={searchParams.get('openEdit') === '1'}
                />
            </div>
        </div>
    );
}
