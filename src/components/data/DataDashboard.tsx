'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EntryEditForm, type EntryEditFormProps } from '@/components/forms/EntryEditForm';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { chart } from '@/lib/chartTheme';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
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

    const chartData = useMemo(() => {
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
    }, [visibleEntries, selectedHabit]);

    const movingAverageData = useMemo(() => {
        const windowSize = 5;
        return chartData.map((point, index: number) => {
            const nextPoint = { ...point };

            selectedHabit?.subvariables.forEach((sub: DashboardSubvariable) => {
                if (sub.type !== 'NUMERIC' && sub.type !== 'SCALE_0_10') return;

                let total = 0;
                let count = 0;

                for (let i = Math.max(0, index - windowSize + 1); i <= index; i++) {
                    const value = chartData[i]?.[sub.name];
                    if (typeof value === 'number') {
                        total += value;
                        count += 1;
                    }
                }

                nextPoint[`${sub.name}_ma`] = count > 0 ? Number((total / count).toFixed(2)) : null;
            });

            return nextPoint;
        });
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
                            {(sub.type === 'NUMERIC' || sub.type === 'SCALE_0_10') && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={movingAverageData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke={chart.axis}
                                            tick={chart.tick}
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={20}
                                        />
                                        <YAxis
                                            stroke={chart.axis}
                                            tick={chart.tick}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={sub.type === 'SCALE_0_10' ? [0, 10] : ['auto', 'auto']}
                                            width={36}
                                        />
                                        <Tooltip
                                            contentStyle={chart.tooltip}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                                        <Line
                                            type="monotone"
                                            dataKey={sub.name}
                                            name="Daily value"
                                            stroke={chart.teal}
                                            strokeWidth={2}
                                            dot={{ fill: chart.surface, strokeWidth: 2, r: 3, stroke: chart.teal }}
                                            activeDot={{ r: 6, strokeWidth: 0, fill: chart.teal }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={`${sub.name}_ma`}
                                            name="5-day trend"
                                            stroke={chart.violet}
                                            strokeWidth={2}
                                            strokeDasharray="6 4"
                                            dot={false}
                                            connectNulls
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}

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
