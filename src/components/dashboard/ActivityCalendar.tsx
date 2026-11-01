'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { parseISO, format, getDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useActivityCalendar } from '@/lib/useActivityCalendar';
import { ActivityDay } from '@/types';

interface ActivityCalendarProps {
    className?: string;
    onDayClick?: (day: ActivityDay) => void;
}

interface CalendarCell {
    key: string;
    day: ActivityDay | null;
}

const SWIPE_HINT_KEY = 'datalyst-activity-calendar-hint-dismissed';

function getIntensityClass(intensity: number): string {
    if (intensity <= 0) return 'bg-[var(--color-bg-subtle)] border-[var(--color-border)]';
    if (intensity === 1) return 'bg-[var(--color-teal)]/15 border-[var(--color-teal)]/40';
    if (intensity === 2) return 'bg-[var(--color-teal)]/40 border-[var(--color-teal)]/50';
    if (intensity === 3) return 'bg-[var(--color-teal)]/70 border-[var(--color-teal)]/70';
    return 'bg-[var(--color-teal)] border-[var(--color-teal)]';
}

function calculateStreaks(days: ActivityDay[]) {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const active = sorted.map(d => d.entriesCount > 0 || d.completionPct > 0);

    let best = 0;
    let current = 0;
    let run = 0;

    for (let i = 0; i < active.length; i++) {
        if (active[i]) {
            run += 1;
            best = Math.max(best, run);
        } else {
            run = 0;
        }
    }

    for (let i = active.length - 1; i >= 0; i--) {
        if (!active[i]) break;
        current += 1;
    }

    const activeDays = active.filter(Boolean).length;

    return { activeDays, current, best };
}

export function ActivityCalendar({ className, onDayClick }: ActivityCalendarProps) {
    const [weeks, setWeeks] = useState<26 | 52>(26);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showSwipeHint, setShowSwipeHint] = useState(() => {
        if (typeof window === 'undefined') return false;
        return sessionStorage.getItem(SWIPE_HINT_KEY) !== '1';
    });
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const { days, isLoading } = useActivityCalendar(weeks === 26 ? 182 : 364);
    const selectedDay = useMemo(
        () => (selectedDate ? days.find((day) => day.date === selectedDate) ?? null : null),
        [days, selectedDate]
    );

    const updateScrollAffordances = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const left = container.scrollLeft > 2;
        const right = container.scrollLeft + container.clientWidth < container.scrollWidth - 2;
        setCanScrollLeft(left);
        setCanScrollRight(right);
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        updateScrollAffordances();
        container.addEventListener('scroll', updateScrollAffordances, { passive: true });
        window.addEventListener('resize', updateScrollAffordances);

        return () => {
            container.removeEventListener('scroll', updateScrollAffordances);
            window.removeEventListener('resize', updateScrollAffordances);
        };
    }, [days, updateScrollAffordances, weeks]);

    const dismissSwipeHint = useCallback(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(SWIPE_HINT_KEY, '1');
        }
        setShowSwipeHint(false);
    }, []);

    const { weekColumns, monthLabels, stats } = useMemo(() => {
        const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
        if (sorted.length === 0) {
            return {
                weekColumns: [] as CalendarCell[][],
                monthLabels: [] as string[],
                stats: { activeDays: 0, current: 0, best: 0 },
            };
        }

        const firstDate = parseISO(sorted[0].date);
        const firstDow = getDay(firstDate);

        const padded: CalendarCell[] = [];

        for (let i = 0; i < firstDow; i++) {
            padded.push({ key: `empty-${i}`, day: null });
        }

        for (const day of sorted) {
            padded.push({ key: day.date, day });
        }

        const columns: CalendarCell[][] = [];
        for (let i = 0; i < padded.length; i += 7) {
            const week = padded.slice(i, i + 7);
            while (week.length < 7) {
                week.push({ key: `tail-${i}-${week.length}`, day: null });
            }
            columns.push(week);
        }

        const labels = columns.map((week) => {
            const firstRealDay = week.find(cell => cell.day !== null)?.day;
            if (!firstRealDay) return '';
            const parsed = parseISO(firstRealDay.date);
            return format(parsed, 'MMM');
        });

        const monthLabelsDeduped = labels.map((label, i) => {
            if (!label) return '';
            if (i === 0) return label;
            return labels[i - 1] === label ? '' : label;
        });

        return {
            weekColumns: columns,
            monthLabels: monthLabelsDeduped,
            stats: calculateStreaks(sorted),
        };
    }, [days]);

    return (
        <section className={cn('rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:p-6', className)}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Check-in activity</h2>
                    <p className="text-sm text-[var(--text-secondary)]">Your day-by-day consistency at a glance.</p>
                </div>

                <div className="inline-flex rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1">
                    <button
                        type="button"
                        onClick={() => setWeeks(26)}
                        className={cn(
                            'min-h-9 px-3 font-mono text-[0.68rem] uppercase tracking-[0.1em] rounded-[var(--radius-button)] transition-colors',
                            weeks === 26 ? 'bg-[var(--color-text-primary)] text-[var(--color-on-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        )}
                        aria-pressed={weeks === 26}
                    >
                        26 weeks
                    </button>
                    <button
                        type="button"
                        onClick={() => setWeeks(52)}
                        className={cn(
                            'min-h-9 px-3 font-mono text-[0.68rem] uppercase tracking-[0.1em] rounded-[var(--radius-button)] transition-colors',
                            weeks === 52 ? 'bg-[var(--color-text-primary)] text-[var(--color-on-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        )}
                        aria-pressed={weeks === 52}
                    >
                        52 weeks
                    </button>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-[var(--radius-input)] bg-[var(--color-bg-subtle)] p-3">
                    <p className="label-mono">Active Days</p>
                    <p className="mt-1 font-mono text-base text-[var(--text-primary)] tabular-nums">{stats.activeDays}</p>
                </div>
                <div className="rounded-[var(--radius-input)] bg-[var(--color-bg-subtle)] p-3">
                    <p className="label-mono">Current Streak</p>
                    <p className="mt-1 font-mono text-base text-[var(--text-primary)] tabular-nums">{stats.current}</p>
                </div>
                <div className="rounded-[var(--radius-input)] bg-[var(--color-bg-subtle)] p-3">
                    <p className="label-mono">Best Streak</p>
                    <p className="mt-1 font-mono text-base text-[var(--text-primary)] tabular-nums">{stats.best}</p>
                </div>
            </div>

            {showSwipeHint && !isLoading && (
                <div className="mb-3 flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 sm:hidden">
                    <p className="text-xs text-[var(--text-secondary)]">Swipe to view earlier weeks</p>
                    <button
                        type="button"
                        onClick={dismissSwipeHint}
                        className="min-h-[44px] px-2 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="h-[120px] animate-pulse rounded-[var(--radius-input)] bg-[var(--color-bg-subtle)]" />
            ) : (
                <div className="relative">
                    {canScrollLeft && (
                        <div className="pointer-events-none absolute bottom-2 left-0 top-0 w-6 bg-gradient-to-r from-[var(--color-bg-card)] to-transparent" />
                    )}
                    {canScrollRight && (
                        <div className="pointer-events-none absolute bottom-2 right-0 top-0 w-6 bg-gradient-to-l from-[var(--color-bg-card)] to-transparent" />
                    )}

                    <div
                        ref={scrollContainerRef}
                        className="overflow-x-auto pb-2 snap-x snap-mandatory"
                        aria-label="Activity calendar"
                    >
                        <div className="min-w-[620px]">
                            <div className="mb-2 ml-8 grid" style={{ gridTemplateColumns: `repeat(${monthLabels.length}, minmax(0, 1fr))` }}>
                                {monthLabels.map((label, idx) => (
                                    <span key={`month-${idx}`} className="text-[10px] font-medium text-[var(--text-tertiary)]">
                                        {label}
                                    </span>
                                ))}
                            </div>

                            <div className="flex gap-1">
                                <div className="mr-1 flex flex-col gap-1 pt-[1px]">
                                    {['S', '', 'T', '', 'T', '', 'S'].map((label, i) => (
                                        <div key={`dow-${i}`} className="h-3 w-6 text-[10px] text-[var(--text-tertiary)]">
                                            {label}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-1 snap-x snap-mandatory">
                                    {weekColumns.map((week, weekIdx) => (
                                        <div key={`week-${weekIdx}`} className="flex flex-col gap-1 snap-start">
                                            {week.map((cell) => {
                                                const day = cell.day;
                                                const title = day
                                                    ? `${day.date} • ${day.completedTrackers}/${day.scheduledTrackers} trackers • ${day.completionPct}%`
                                                    : '';

                                                return (
                                                    <button
                                                        key={cell.key}
                                                        type="button"
                                                        title={title}
                                                        disabled={!day}
                                                        onClick={() => day && setSelectedDate(day.date)}
                                                        className={cn(
                                                            'h-3 w-3 rounded-[2px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2',
                                                            day
                                                                ? cn(getIntensityClass(day.intensity), selectedDay?.date === day.date ? 'ring-1 ring-[var(--color-accent)]' : 'hover:scale-110')
                                                                : 'border-transparent bg-transparent'
                                                        )}
                                                        aria-label={
                                                            day
                                                                ? `${day.date}, ${day.completedTrackers} of ${day.scheduledTrackers} trackers completed`
                                                                : undefined
                                                        }
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedDay && (
                <div className="mt-3 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3" role="region" aria-label="Selected day details">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{format(parseISO(selectedDay.date), "EEEE, MMM d")}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {selectedDay.completedTrackers}/{selectedDay.scheduledTrackers} trackers completed ({selectedDay.completionPct}%)
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                        {selectedDay.entriesCount} total check-ins
                    </p>
                    <button
                        type="button"
                        onClick={() => onDayClick?.(selectedDay)}
                        aria-label={`Open entries for ${selectedDay.date}`}
                        className="mt-2 min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
                    >
                        Open day entries
                    </button>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                    <div
                        key={`legend-${level}`}
                        className={cn('h-3 w-3 rounded-[2px] border', getIntensityClass(level))}
                        aria-hidden
                    />
                ))}
                <span>More</span>
            </div>
        </section>
    );
}

export default ActivityCalendar;
