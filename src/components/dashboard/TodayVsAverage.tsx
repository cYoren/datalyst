'use client';

import Link from 'next/link';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useDataPage } from '@/lib/hooks';
import { formatLocalDateKey } from '@/lib/dateUtils';

interface DataHabit {
    id: string;
    icon?: string | null;
    subvariables: { id: string; name: string; type: string; unit?: string | null }[];
}
interface DataEntry {
    logicalDate: string;
    subvariableEntries: { subvariableId: string; numericValue: number | null }[];
}

export interface TodayComparison {
    id: string;
    name: string;
    icon: string;
    unit?: string | null;
    today: number;
    average: number;
    days: number;
}

const MIN_PRIOR_DAYS = 3;
const WINDOW_DAYS = 14;

/**
 * Today's value next to the user's own recent average, per numeric or 0-10
 * variable. This is the feedback a user gets from day 4, long before the
 * 14 days correlations need.
 */
export function compareTodayToAverage(habits: DataHabit[], entries: DataEntry[], todayKey: string): TodayComparison[] {
    const cutoff = new Date(`${todayKey}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - WINDOW_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);

    const today = new Map<string, number>();
    const prior = new Map<string, Map<string, number>>(); // subvariable -> day -> value (one per day)
    for (const entry of entries) {
        const day = entry.logicalDate.slice(0, 10);
        if (day > todayKey || day < cutoffKey) continue;
        for (const sv of entry.subvariableEntries) {
            if (sv.numericValue === null || !Number.isFinite(sv.numericValue)) continue;
            if (day === todayKey) today.set(sv.subvariableId, sv.numericValue);
            else {
                if (!prior.has(sv.subvariableId)) prior.set(sv.subvariableId, new Map());
                prior.get(sv.subvariableId)!.set(day, sv.numericValue);
            }
        }
    }

    const rows: TodayComparison[] = [];
    for (const habit of habits) {
        for (const sv of habit.subvariables) {
            if (sv.type !== 'NUMERIC' && sv.type !== 'SCALE_0_10') continue;
            const value = today.get(sv.id);
            const days = [...(prior.get(sv.id)?.values() ?? [])];
            if (value === undefined || days.length < MIN_PRIOR_DAYS) continue;
            rows.push({
                id: sv.id,
                name: sv.name,
                icon: habit.icon ?? '',
                unit: sv.unit,
                today: value,
                average: days.reduce((a, b) => a + b, 0) / days.length,
                days: days.length,
            });
        }
    }
    return rows;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function TodayVsAverage() {
    const { habits, entries, isLoading } = useDataPage();
    if (isLoading || !habits?.length) return null;

    const rows = compareTodayToAverage(habits, entries ?? [], formatLocalDateKey(new Date())).slice(0, 5);
    if (rows.length === 0) return null;

    return (
        <Card className="p-4 animate-fade-in">
            <h2 className="label-mono">Today vs your average</h2>
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
                {rows.map((row) => {
                    const delta = row.today - row.average;
                    const flat = Math.abs(delta) < Math.max(0.05 * Math.abs(row.average), 0.1);
                    const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
                    return (
                        <li key={row.id} className="flex items-center gap-3 py-2.5">
                            <TrackerIcon value={row.icon} className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{row.name}</span>
                            <span className="text-right text-sm tabular-nums">
                                <span className="font-semibold text-[var(--text-primary)]">{fmt(row.today)}{row.unit ? ` ${row.unit}` : ''}</span>
                                <span className="block text-xs text-[var(--text-tertiary)]">avg {fmt(row.average)} · {row.days}d</span>
                            </span>
                            <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label={flat ? 'about average' : delta > 0 ? 'above average' : 'below average'} />
                        </li>
                    );
                })}
            </ul>
            <Link href="/data" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-[var(--color-accent)]">
                Open your charts <ArrowRight className="h-4 w-4" />
            </Link>
        </Card>
    );
}
