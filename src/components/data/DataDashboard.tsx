'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EntryEditForm, type EntryEditFormProps } from '@/components/forms/EntryEditForm';
import { format } from 'date-fns';
import { buildDailyRows, isSummedVariable } from '@/lib/dailyChart';
import { DotAreaChart } from '@/components/charts/DotAreaChart';
import { cn } from '@/lib/utils';
import { chart } from '@/lib/chartTheme';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
} from 'recharts';
import { Download, Edit2, BarChart3, PlusCircle, ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';
import Link from 'next/link';

const TYPE_LABELS: Record<string, string> = {
    NUMERIC: 'Number',
    SCALE_0_10: 'Scale 0 to 10',
    BOOLEAN: 'Yes / No',
    CATEGORY: 'Category',
};

interface DashboardSubvariableEntry {
    subvariableId: string;
    numericValue: number;
    rawValue?: string;
}

interface DashboardEntry {
    id: string;
    habitId: string;
    logicalDate: string;
    note?: string;
    subvariableEntries: DashboardSubvariableEntry[];
}

type DashboardHabit = EntryEditFormProps['entry']['habit'];
type DashboardSubvariable = DashboardHabit['subvariables'][number];

interface ChartPoint {
    date: string;
    fullDate: string;
    [key: string]: string | number | null;
}

interface DataDashboardProps {
    habits: DashboardHabit[];
    entries: DashboardEntry[];
    onRefresh?: () => void;
    focusDate?: string | null;
    openEditOnLoad?: boolean;
}

const PAGE_SIZE = 50;

export function DataDashboard({ habits, entries, onRefresh, focusDate, openEditOnLoad = false }: DataDashboardProps) {
    const initialHabitId = useMemo(() => {
        if (!focusDate) return habits[0]?.id || '';

        const firstHabitWithEntry = habits.find((habit) =>
            entries.some((entry) =>
                entry.habitId === habit.id &&
                format(new Date(entry.logicalDate), 'yyyy-MM-dd') === focusDate
            )
        );

        return firstHabitWithEntry?.id || habits[0]?.id || '';
    }, [focusDate, habits, entries]);

    const [selectedHabitId, setSelectedHabitId] = useState<string>(initialHabitId);
    const [editingEntry, setEditingEntry] = useState<EntryEditFormProps['entry'] | null>(null);
    const [page, setPage] = useState(0);
    const [dateFilter, setDateFilter] = useState<string>(focusDate || '');
    const [contextMessage, setContextMessage] = useState<string | null>(null);
    const [mobileSubvariableId, setMobileSubvariableId] = useState<string>('');
    const [isMobileView, setIsMobileView] = useState<boolean>(() => (
        typeof window !== 'undefined' ? window.innerWidth < 640 : false
    ));
    const [showMobileHistory, setShowMobileHistory] = useState(false);
    const hasHandledOpenEditRef = useRef(false);
    const firstEditButtonRef = useRef<HTMLButtonElement | null>(null);

    const selectedHabit = habits.find(h => h.id === selectedHabitId);


    useEffect(() => {
        if (typeof window === 'undefined') return;

        const media = window.matchMedia('(max-width: 639px)');
        const updateMobileState = () => setIsMobileView(media.matches);
        updateMobileState();

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', updateMobileState);
            return () => media.removeEventListener('change', updateMobileState);
        }

        media.addListener(updateMobileState);
        return () => media.removeListener(updateMobileState);
    }, []);

    const habitEntries = useMemo(() => {
        if (!selectedHabitId) return [];
        return entries
            .filter(e => e.habitId === selectedHabitId)
            .sort((a, b) => new Date(a.logicalDate).getTime() - new Date(b.logicalDate).getTime());
    }, [selectedHabitId, entries]);

    const visibleEntries = useMemo(() => {
        if (!dateFilter) return habitEntries;

        return habitEntries.filter(entry => (
            format(new Date(entry.logicalDate), 'yyyy-MM-dd') === dateFilter
        ));
    }, [habitEntries, dateFilter]);

    const allEntriesForDate = useMemo(() => {
        if (!dateFilter) return [];
        return entries.filter((entry) => (
            format(new Date(entry.logicalDate), 'yyyy-MM-dd') === dateFilter
        ));
    }, [entries, dateFilter]);

    const activeMobileSubvariableId = selectedHabit?.subvariables.some((sub) => sub.id === mobileSubvariableId)
        ? mobileSubvariableId
        : selectedHabit?.subvariables[0]?.id || '';

    const chartSubvariables = useMemo(() => {
        if (!selectedHabit?.subvariables?.length) return [];
        if (!isMobileView) return selectedHabit.subvariables;

        return selectedHabit.subvariables.filter((sub) => sub.id === activeMobileSubvariableId);
    }, [activeMobileSubvariableId, isMobileView, selectedHabit]);

    const shouldRenderHistoryTable = !isMobileView || showMobileHistory || openEditOnLoad || !!dateFilter;

    useEffect(() => {
        hasHandledOpenEditRef.current = false;
    }, [dateFilter]);

    useEffect(() => {
        if (openEditOnLoad) {
            hasHandledOpenEditRef.current = false;
        }
    }, [openEditOnLoad]);

    useEffect(() => {
        if (!openEditOnLoad || !dateFilter || hasHandledOpenEditRef.current) return;

        const timeoutId = window.setTimeout(() => {
            if (allEntriesForDate.length === 0) {
                setContextMessage(`No entries found for ${dateFilter}.`);
                hasHandledOpenEditRef.current = true;
                return;
            }

            if (allEntriesForDate.length === 1) {
                const [entry] = allEntriesForDate;
                const entryHabit = habits.find((habit) => habit.id === entry.habitId);

                if (entryHabit) {
                    setSelectedHabitId(entryHabit.id);
                    setContextMessage(`Opened entry for ${dateFilter}.`);
                    setEditingEntry({
                        ...entry,
                        habit: entryHabit,
                    });
                    hasHandledOpenEditRef.current = true;
                    return;
                }
            }

            setContextMessage(`${allEntriesForDate.length} entries found for ${dateFilter}. Pick one to edit.`);
            hasHandledOpenEditRef.current = true;
            firstEditButtonRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [allEntriesForDate, dateFilter, habits, openEditOnLoad]);

    // A dose tracker logs several entries a day; its day is their total, so it gets
    // one row per day instead of one point per entry.
    const usesDailyTotals = useMemo(
        () => (selectedHabit?.subvariables ?? []).some((sub: DashboardSubvariable) => isSummedVariable(sub)),
        [selectedHabit]
    );

    const chartData = useMemo(() => {
        if (usesDailyTotals && selectedHabit) {
            return buildDailyRows(visibleEntries, selectedHabit.subvariables) as ChartPoint[];
        }

        return visibleEntries.map(entry => {
            const dataPoint: ChartPoint = {
                date: format(new Date(entry.logicalDate), 'MM/dd'),
                fullDate: format(new Date(entry.logicalDate), "MMM dd"),
            };

            entry.subvariableEntries.forEach((sub: DashboardSubvariableEntry) => {
                const subDef = selectedHabit?.subvariables.find((s: DashboardSubvariable) => s.id === sub.subvariableId);
                if (subDef) {
                    if (subDef.type === 'CATEGORY') {
                        dataPoint[subDef.name] = sub.rawValue ?? null;
                    } else {
                        dataPoint[subDef.name] = sub.numericValue;
                    }
                }
            });
            return dataPoint;
        });
    }, [usesDailyTotals, visibleEntries, selectedHabit]);

    // The house chart takes plain points: one per day, plus a handful of dates for
    // the axis so the labels never collide. Built per subvariable, because a habit
    // can hold several numbers and each card shows its own.
    const trendFor = useMemo(() => {
        const trends = new Map<string, { points: Array<{ x: number; y: number }>; labels: Array<{ x: number; text: string }>; mean: number | null }>();

        for (const sub of selectedHabit?.subvariables ?? []) {
            if (sub.type !== 'NUMERIC' && sub.type !== 'SCALE_0_10') continue;

            const points = chartData
                .map((row, index) => ({
                    x: index,
                    y: typeof row[sub.name] === 'number' ? Number(row[sub.name]) : null,
                }))
                .filter((point): point is { x: number; y: number } => point.y !== null);

            const step = Math.max(1, Math.ceil(chartData.length / 5));
            const labels = chartData
                .map((row, index) => ({ index, text: String(row.date ?? '') }))
                .filter(({ index }) => index % step === 0 || index === chartData.length - 1)
                // A forced last label can land on the step label before it.
                .filter(({ index }, position, all) => (
                    position === all.length - 1 || all[position + 1].index - index > step * 0.6
                ))
                .map(({ index, text }) => ({ x: index, text }));

            const mean = points.length > 0 ? points.reduce((total, point) => total + point.y, 0) / points.length : null;
            trends.set(sub.id, { points, labels, mean });
        }

        return trends;
    }, [chartData, selectedHabit]);

    const getCategoryChartData = (sub: DashboardSubvariable) => {
        const frequency = new Map<string, number>();

        visibleEntries.forEach((entry) => {
            const subEntry = entry.subvariableEntries.find((item: DashboardSubvariableEntry) => item.subvariableId === sub.id);
            if (!subEntry) return;

            const raw = subEntry.rawValue || String(subEntry.numericValue);
            frequency.set(raw, (frequency.get(raw) || 0) + 1);
        });

        return Array.from(frequency.entries()).map(([category, count]) => ({ category, count }));
    };

    const handleEditSuccess = () => {
        setEditingEntry(null);
        if (onRefresh) {
            onRefresh();
        } else {
            window.location.reload();
        }
    };

    if (!selectedHabit) {
        return (
            <div className="text-center py-12 space-y-4">
                <BarChart3 className="h-12 w-12 mx-auto text-[var(--text-tertiary)] opacity-50" suppressHydrationWarning />
                <div>
                    <p className="text-[var(--text-secondary)] font-medium">No trackers yet</p>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">
                        Create a tracker to start tracking and see your data here.
                    </p>
                </div>
                <Link
                    href="/habits/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-[var(--radius-button)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                    <PlusCircle className="h-4 w-4" suppressHydrationWarning />
                    Create Tracker
                </Link>
            </div>
        );
    }

    const handleExportCSV = () => {
        if (!selectedHabit || visibleEntries.length === 0) return;

        const headers = ['Date', 'Note', ...selectedHabit.subvariables.map((s: DashboardSubvariable) => s.name)];

        const rows = visibleEntries.map(entry => {
            const date = format(new Date(entry.logicalDate), 'yyyy-MM-dd');
            const note = entry.note ? `"${entry.note.replace(/"/g, '""')}"` : '';

            const subValues = selectedHabit.subvariables.map((sub: DashboardSubvariable) => {
                const subEntry = entry.subvariableEntries.find((s: DashboardSubvariableEntry) => s.subvariableId === sub.id);
                if (!subEntry) return '';
                return subEntry.rawValue || subEntry.numericValue;
            });

            return [date, note, ...subValues].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${selectedHabit.name}_export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8">
            {/* Habit Selector */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-[var(--color-border)]">
                {habits.map(habit => (
                    <button
                        key={habit.id}
                        onClick={() => { setSelectedHabitId(habit.id); setPage(0); }}
                        className={`px-4 py-2 rounded-[var(--radius-button)] text-sm font-medium transition-all ${selectedHabitId === habit.id
                            ? 'border border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-on-accent)]'
                            : 'border border-[var(--color-border-hover)] text-[var(--text-secondary)] hover:border-[var(--color-text-primary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        <TrackerIcon value={habit.icon} className="mr-2 inline h-4 w-4 -mt-0.5" />
                        {habit.name}
                    </button>
                ))}
            </div>

            {/* Date filter */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="label-mono inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" suppressHydrationWarning />
                    Focus date
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => {
                            setDateFilter(e.target.value);
                            setPage(0);
                        }}
                        className="h-11 rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] px-3 text-sm text-[var(--text-primary)]"
                    />
                    {dateFilter && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setDateFilter('');
                                setPage(0);
                            }}
                        >
                            <X className="h-4 w-4 mr-1" suppressHydrationWarning />
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            {dateFilter && contextMessage && (
                <div className="rounded-[var(--radius-input)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
                    {contextMessage}
                </div>
            )}

            {/* Charts Section */}
            {selectedHabit.subvariables.length > 1 && (
                <div className="sm:hidden">
                    <p className="label-mono mb-2">Chart variable</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {selectedHabit.subvariables.map((sub: DashboardSubvariable) => (
                            <button
                                key={`mobile-var-${sub.id}`}
                                type="button"
                                onClick={() => setMobileSubvariableId(sub.id)}
                                className={cn(
                                    "min-h-[44px] shrink-0 rounded-[var(--radius-button)] border px-3 py-2 text-xs font-medium transition-colors",
                                    activeMobileSubvariableId === sub.id
                                        ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-on-accent)]"
                                        : "border-[var(--color-border-hover)] bg-transparent text-[var(--text-secondary)]"
                                )}
                            >
                                {sub.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-8">
                {chartSubvariables.map((sub: DashboardSubvariable) => (
                    <Card
                        key={sub.id}
                        className="p-6 paper-lift shadow-[var(--shadow-card)]"
                    >
                        <h3 className="text-lg font-semibold mb-6 text-[var(--text-primary)] font-display flex items-center gap-2">
                            {sub.name}
                            <span className="text-xs font-normal text-[var(--text-tertiary)] px-2 py-1 bg-[var(--color-bg-subtle)] rounded-[var(--radius-input)] font-body">
                                {TYPE_LABELS[sub.type] ?? sub.type}
                            </span>
                        </h3>

                        <div className="h-[300px] w-full">
                            {(sub.type === 'NUMERIC' || sub.type === 'SCALE_0_10') && (() => {
                                const trend = trendFor.get(sub.id);
                                if (!trend || trend.points.length === 0) {
                                    return (
                                        <p className="flex h-full items-center justify-center text-sm text-[var(--text-tertiary)]">
                                            No values logged yet.
                                        </p>
                                    );
                                }
                                return (
                                    <DotAreaChart
                                        series={[{ id: sub.name, color: chart.tealRgb, points: trend.points }]}
                                        min={0}
                                        max={Math.max(1, trend.points.length - 1)}
                                        yMax={sub.type === 'SCALE_0_10' ? 10 : undefined}
                                        height={300}
                                        axisLabels={trend.labels}
                                        rules={trend.mean === null ? [] : [{ y: trend.mean, label: `avg ${trend.mean.toFixed(1)}` }]}
                                        ariaLabel={`${sub.name} over ${trend.points.length} entries, average ${trend.mean === null ? 'unknown' : trend.mean.toFixed(1)}`}
                                    />
                                );
                            })()}

                            {sub.type === 'BOOLEAN' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                                        <XAxis dataKey="date" stroke={chart.axis} tick={chart.tick} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={chart.tooltipCursor}
                                            contentStyle={chart.tooltip}
                                        />
                                        <Bar dataKey={sub.name} fill={chart.teal} radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}

                            {sub.type === 'CATEGORY' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={getCategoryChartData(sub)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                                        <XAxis dataKey="category" stroke={chart.axis} tick={chart.tick} tickLine={false} axisLine={false} />
                                        <YAxis stroke={chart.axis} tick={chart.tick} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={chart.tooltipCursor}
                                            contentStyle={chart.tooltip}
                                        />
                                        <Bar dataKey="count" fill={chart.teal} radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </Card>
                ))}
            </div>

            {/* Data Table */}
            {isMobileView && !shouldRenderHistoryTable ? (
                <Card className="p-4 bg-[var(--color-bg-card)]">
                    <p className="text-sm text-[var(--text-secondary)]">Detailed history is available when needed.</p>
                    <button
                        type="button"
                        onClick={() => setShowMobileHistory(true)}
                        className="mt-3 min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
                    >
                        Show detailed history
                    </button>
                </Card>
            ) : (
                <Card className="overflow-hidden shadow-[var(--shadow-card)] paper-lift">
                    <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] font-display">Detailed History</h3>
                        <Button variant="outline" size="sm" onClick={handleExportCSV}>
                            <Download className="h-4 w-4 mr-2" suppressHydrationWarning />
                            Export CSV
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-[var(--text-tertiary)] bg-[var(--color-bg-subtle)] font-display">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Date</th>
                                    {selectedHabit.subvariables.map((sub: DashboardSubvariable) => (
                                        <th key={sub.id} className="px-6 py-3 font-medium">{sub.name}</th>
                                    ))}
                                    <th className="px-6 py-3 font-medium">Note</th>
                                    <th className="px-6 py-3 font-medium w-16">Edit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {visibleEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry, index) => (
                                    <tr key={entry.id} className="bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                                        <td className="px-6 py-4 font-medium text-[var(--text-primary)] whitespace-nowrap tabular-nums">
                                            {format(new Date(entry.logicalDate), "MMM dd, yyyy")}
                                        </td>
                                        {selectedHabit.subvariables.map((sub: DashboardSubvariable) => {
                                            const subEntry = entry.subvariableEntries.find((s: DashboardSubvariableEntry) => s.subvariableId === sub.id);
                                            return (
                                                <td key={sub.id} className="px-6 py-4 text-[var(--text-secondary)] tabular-nums">
                                                    {subEntry
                                                        ? (subEntry.rawValue || subEntry.numericValue)
                                                        : '-'}
                                                </td>
                                            );
                                        })}
                                        <td className="px-6 py-4 text-[var(--text-secondary)] max-w-xs truncate">
                                            {entry.note || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                ref={index === 0 ? firstEditButtonRef : undefined}
                                                onClick={() => setEditingEntry({
                                                    ...entry,
                                                    habit: selectedHabit
                                                })}
                                                className="h-11 w-11 rounded-[var(--radius-input)] hover:bg-[var(--color-bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                                                title="Edit entry"
                                                aria-label={`Edit entry from ${format(new Date(entry.logicalDate), "yyyy-MM-dd")}`}
                                            >
                                                <Edit2 className="h-4 w-4" suppressHydrationWarning />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {visibleEntries.length === 0 && (
                                    <tr>
                                        <td colSpan={selectedHabit.subvariables.length + 3} className="px-6 py-8 text-center text-[var(--text-tertiary)]">
                                            {dateFilter
                                                ? `No entries found for ${dateFilter}.`
                                                : 'No entries found for this tracker in the selected period.'}
                                            {dateFilter && (
                                                <div className="mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDateFilter('')}
                                                        className="min-h-[44px] rounded-[var(--radius-button)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                    >
                                                        Clear date filter
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Pagination */}
            {visibleEntries.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-2">
                    <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleEntries.length)} of {visibleEntries.length}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4" suppressHydrationWarning /> Prev
                        </Button>
                        <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= visibleEntries.length} onClick={() => setPage(p => p + 1)}>
                            Next <ChevronRight className="h-4 w-4" suppressHydrationWarning />
                        </Button>
                    </div>
                </div>
            )}

            {/* Entry Edit Modal */}
            <Modal
                isOpen={!!editingEntry}
                onClose={() => setEditingEntry(null)}
                title="Edit Entry"
            >
                {editingEntry && (
                    <EntryEditForm
                        entry={editingEntry}
                        onSuccess={handleEditSuccess}
                        onCancel={() => setEditingEntry(null)}
                        onDelete={handleEditSuccess}
                    />
                )}
            </Modal>
        </div>
    );
}
