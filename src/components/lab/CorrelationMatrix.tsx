'use client';

import React from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import useSWR from 'swr';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Loader2, FlaskConical, PlusCircle } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { fetcher } from '@/lib/hooks';

interface Variable {
    id: string;
    name: string;
    habitName: string;
    habitIcon: string;
}

interface CorrelationData {
    variables: Variable[];
    matrix: (number | null)[][];
    error?: string;
}



/**
 * Get color for correlation value
 * Teal = positive, Amber = negative, Warm gray = neutral/no data
 */
function getCorrelationColor(r: number | null): string {
    if (r === null) return 'bg-[var(--color-bg-subtle)]';

    const absR = Math.abs(r);
    if (r > 0) {
        // Positive: teal shades
        if (absR >= 0.7) return 'bg-[var(--color-teal)] text-[var(--color-on-accent)]';
        if (absR >= 0.5) return 'bg-[var(--color-teal)]/70 text-[var(--color-on-accent)]';
        if (absR >= 0.3) return 'bg-[var(--color-teal)]/30 text-[var(--color-text-primary)]';
        return 'bg-[var(--color-teal)]/15 text-[var(--color-teal)]';
    } else {
        // Negative: amber shades
        if (absR >= 0.7) return 'bg-[var(--color-amber)] text-[var(--color-on-accent)]';
        if (absR >= 0.5) return 'bg-[var(--color-amber)]/70 text-[var(--color-on-accent)]';
        if (absR >= 0.3) return 'bg-[var(--color-amber)]/30 text-[var(--color-text-primary)]';
        return 'bg-[var(--color-amber)]/15 text-[var(--color-amber)]';
    }
}

interface CorrelationMatrixProps {
    onCellClick?: (var1Id: string, var2Id: string, correlation: number | null) => void;
}

export default function CorrelationMatrix({ onCellClick }: CorrelationMatrixProps) {
    const { data, isLoading, error } = useSWR<CorrelationData>(
        '/api/correlations',
        fetcher,
        {
            revalidateOnFocus: false,
            keepPreviousData: true,
            dedupingInterval: 120000,
        }
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
            </div>
        );
    }

    if (error || !data || data.error) {
        return (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
                {data?.error || 'Failed to load correlation data'}
            </div>
        );
    }

    if (!data.variables || !Array.isArray(data.variables) || data.variables.length < 2) {
        return (
            <div className="text-center py-12 space-y-4">
                <FlaskConical className="h-12 w-12 mx-auto text-[var(--text-tertiary)] opacity-50" suppressHydrationWarning />
                <div>
                    <p className="text-[var(--text-secondary)] font-medium">Not enough data yet</p>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">
                        Create at least 2 trackers and check in for 14+ days to see correlations.
                    </p>
                </div>
                <Link
                    href="/habits/new"
                    className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-[var(--radius-button)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                    <PlusCircle className="h-4 w-4" suppressHydrationWarning />
                    Create Tracker
                </Link>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="p-3 text-left text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider w-32 min-w-[120px]">Variable</th>
                        {data.variables.map((variable) => (
                            <th
                                key={variable.id}
                                className="p-2 text-center text-xs font-medium text-[var(--text-secondary)] min-w-[80px] max-w-[120px]"
                                title={`${variable.habitName}: ${variable.name}`}
                            >
                                <div className="truncate">
                                    <TrackerIcon value={variable.habitIcon} className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />{variable.name}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.variables.map((rowVar, rowIndex) => (
                        <tr key={rowVar.id}>
                            <td
                                className="p-2 text-xs font-medium text-[var(--text-secondary)] truncate max-w-[120px]"
                                title={`${rowVar.habitName}: ${rowVar.name}`}
                            >
                                <TrackerIcon value={rowVar.habitIcon} className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />{rowVar.name}
                            </td>
                            {data.variables.map((colVar, colIndex) => {
                                const correlation = data.matrix[rowIndex]?.[colIndex];
                                const isDiagonal = rowIndex === colIndex;

                                return (
                                    <td
                                        key={colVar.id}
                                        className={cn(
                                            "p-2 text-center font-mono text-xs font-medium tabular-nums transition-all",
                                            isDiagonal
                                                ? "bg-[var(--color-bg-subtle)] text-[var(--text-secondary)]"
                                                : getCorrelationColor(correlation),
                                            !isDiagonal && correlation !== null && onCellClick
                                                ? "cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-[var(--color-accent)]"
                                                : ""
                                        )}
                                        onClick={() => {
                                            if (!isDiagonal && correlation !== null && onCellClick) {
                                                onCellClick(rowVar.id, colVar.id, correlation);
                                            }
                                        }}
                                        title={
                                            isDiagonal
                                                ? 'Self-correlation'
                                                : correlation !== null
                                                    ? `r = ${correlation.toFixed(2)}`
                                                    : 'Insufficient data'
                                        }
                                    >
                                        {isDiagonal ? '—' : correlation !== null ? correlation.toFixed(2) : '—'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-[var(--text-tertiary)] flex-wrap">
                <InfoTooltip text="Values range from -1 to +1. Closer to +1 means both variables increase together. Closer to -1 means when one goes up, the other goes down. Values near 0 mean no relationship." />
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-[var(--color-teal)] rounded-[2px]" />
                    <span>Strong +</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-[var(--color-teal)]/30 rounded-[2px]" />
                    <span>Moderate +</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-[var(--color-bg-subtle)] rounded-[2px]" />
                    <span>Weak/None</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-[var(--color-amber)]/30 rounded-[2px]" />
                    <span>Moderate −</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-[var(--color-amber)] rounded-[2px]" />
                    <span>Strong −</span>
                </div>
            </div>
        </div>
    );
}
