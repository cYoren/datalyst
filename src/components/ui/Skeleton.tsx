'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "rounded-md bg-[var(--color-bg-subtle)]",
                className
            )}
            style={{ animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
        />
    );
}

// Stat card skeleton (for dashboard stats)
export function SkeletonStatCard() {
    return (
        <div className="p-4 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
            <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="h-10 w-10 shrink-0 rounded-[var(--radius-card)]" />
                <div className="space-y-2 min-w-0 flex-1">
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-3 w-full max-w-20" />
                </div>
            </div>
        </div>
    );
}

// Habit/Protocol card skeleton
export function SkeletonHabitCard() {
    return (
        <div className="p-5 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
            <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-[var(--radius-card)] flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-3">
                    <Skeleton className="h-5 w-full max-w-32" />
                    <Skeleton className="h-4 w-full max-w-48" />
                    <div className="flex gap-2 pt-2">
                        <Skeleton className="h-6 w-16 rounded-[var(--radius-button)]" />
                        <Skeleton className="h-6 w-20 rounded-[var(--radius-button)]" />
                    </div>
                </div>
                <Skeleton className="hidden sm:block h-9 w-20 shrink-0 rounded-[var(--radius-card)]" />
            </div>
        </div>
    );
}

// Insight card skeleton
export function SkeletonInsightCard() {
    return (
        <div className="p-6 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-3/4" />
                <div className="flex gap-6">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                </div>
            </div>
        </div>
    );
}

// Hero insight skeleton
export function SkeletonHeroInsight() {
    return (
        <div className="p-8 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
            <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-3/4" />
                <div className="flex gap-6 pt-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                </div>
            </div>
        </div>
    );
}

// Full dashboard skeleton layout
export function DashboardSkeleton() {
    return (
        <div className="space-y-10 pb-20 animate-fade-in min-w-0" role="status" aria-label="Loading dashboard">
            <span className="sr-only">Loading dashboard…</span>
            {/* Header */}
            <header className="space-y-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-64" />

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <SkeletonStatCard />
                    <SkeletonStatCard />
                    <SkeletonStatCard />
                    <SkeletonStatCard />
                </div>
            </header>

            {/* Today's Log Widget Skeleton */}
            <div className="p-4 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
                <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-8 w-24 rounded-[var(--radius-card)]" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-16 rounded-[var(--radius-card)]" />
                    <Skeleton className="h-16 rounded-[var(--radius-card)]" />
                    <Skeleton className="h-16 rounded-[var(--radius-card)]" />
                </div>
            </div>

            {/* Protocols */}
            <div className="space-y-4">
                <SkeletonHabitCard />
                <SkeletonHabitCard />
                <SkeletonHabitCard />
            </div>

            {/* Insights */}
            <section className="space-y-6 pt-10 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-7 w-24" />
                </div>
                <SkeletonHeroInsight />
                <div className="grid gap-6">
                    <SkeletonInsightCard />
                    <SkeletonInsightCard />
                </div>
            </section>
        </div>
    );
}

// Data page skeleton
export function DataPageSkeleton() {
    return (
        <div className="space-y-8 pb-20 animate-fade-in">
            <header>
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-[var(--radius-card)]" />
                    <Skeleton className="h-10 w-40" />
                </div>
                <Skeleton className="h-5 w-64 mt-2" />
            </header>

            {/* Chart placeholder */}
            <div className="p-6 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
            </div>

            {/* Table placeholder */}
            <div className="p-6 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
                <Skeleton className="h-6 w-24 mb-4" />
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
        </div>
    );
}

// Generic form/edit page skeleton
export function FormPageSkeleton() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-11 w-24 rounded-[var(--radius-button)]" />
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-40" />
                        <Skeleton className="h-4 w-56" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-11 w-36 rounded-[var(--radius-button)]" />
                    <Skeleton className="h-11 w-36 rounded-[var(--radius-button)]" />
                </div>
            </div>

            <div className="p-5 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] space-y-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-11 w-full rounded-[var(--radius-input)]" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-24 w-full rounded-[var(--radius-input)]" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-11 w-full rounded-[var(--radius-input)]" />
                <div className="flex justify-end">
                    <Skeleton className="h-11 w-32 rounded-[var(--radius-button)]" />
                </div>
            </div>
        </div>
    );
}
