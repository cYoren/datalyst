'use client';

import React, { useState } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,

} from 'recharts';
import { cn } from '@/lib/utils';
import { chart } from '@/lib/chartTheme';

interface ChartDataPoint {
    date: string;
    independent: number | null;
    dependent: number | null;
    isWashout?: boolean;
    condition?: string | null;
}

interface ExperimentChartProps {
    data: ChartDataPoint[];
    independentName: string;
    independentUnit: string;
    dependentName: string;
    dependentUnit: string;
    correlation: number | null;
    correlationType: 'pearson' | 'spearman';
    strength: string;
    conditionLabels?: string[];
    isBlind?: boolean;
}

export default function ExperimentChart({
    data,
    independentName,
    independentUnit,
    dependentName,
    dependentUnit,
    correlation,
    correlationType,
    strength,
    conditionLabels,
    isBlind,
}: ExperimentChartProps) {
    const [normalized, setNormalized] = useState(false);

    // Calculate min/max for normalization
    const independentValues = data.map(d => d.independent).filter((v): v is number => v !== null);
    const dependentValues = data.map(d => d.dependent).filter((v): v is number => v !== null);

    const indMin = Math.min(...independentValues);
    const indMax = Math.max(...independentValues);
    const depMin = Math.min(...dependentValues);
    const depMax = Math.max(...dependentValues);

    // Normalize function
    const normalize = (value: number | null, min: number, max: number): number | null => {
        if (value === null) return null;
        if (max === min) return 50; // Avoid division by zero
        return ((value - min) / (max - min)) * 100;
    };

    // Transform data for normalized view
    const chartData = normalized
        ? data.map(d => ({
            ...d,
            independent: normalize(d.independent, indMin, indMax),
            dependent: normalize(d.dependent, depMin, depMax),
        }))
        : data;

    // Format date for display
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Get correlation color
    const getCorrelationColor = () => {
        if (correlation === null) return 'text-[var(--color-text-secondary)]';
        if (correlation >= 0.7) return 'text-[var(--color-teal)]';
        if (correlation >= 0.3) return 'text-[var(--color-teal)]';
        if (correlation >= -0.3) return 'text-[var(--color-text-secondary)]';
        if (correlation >= -0.7) return 'text-[var(--color-coral)]';
        return 'text-[var(--color-coral)]';
    };

    return (
        <div className="space-y-4">
            {/* Header with Correlation Badge */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className={cn("text-3xl font-bold", getCorrelationColor())}>
                        r = {correlation !== null ? correlation.toFixed(2) : 'N/A'}
                    </div>
                    <div className="text-sm">
                        <div className="font-medium text-[var(--text-primary)]">{strength}</div>
                        <div className="text-[var(--text-tertiary)]">({correlationType})</div>
                    </div>
                </div>

                {/* Normalized Toggle */}
                <button
                    onClick={() => setNormalized(!normalized)}
                    className={cn(
                        "px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-all border",
                        normalized
                            ? "bg-[var(--color-violet)]/15 border-[var(--color-violet)]/40 text-[var(--color-violet)]"
                            : "bg-[var(--color-bg-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"
                    )}
                >
                    {normalized ? 'Normalized view' : 'Raw values'}
                </button>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm break-words">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[var(--color-violet)] rounded" />
                    <span className="text-[var(--text-secondary)]">
                        {independentName} {independentUnit && `(${independentUnit})`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[var(--color-teal)] rounded-full" />
                    <span className="text-[var(--text-secondary)]">
                        {dependentName} {dependentUnit && `(${dependentUnit})`}
                    </span>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px] w-full">
                <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={chart.tick}
                            stroke={chart.axis}
                        />
                        <YAxis
                            yAxisId="left"
                            orientation="left"
                            tick={chart.tick}
                            stroke={chart.violet}
                            label={{
                                value: normalized ? '%' : independentUnit,
                                angle: -90,
                                position: 'insideLeft',
                                style: { fontSize: 12, fill: chart.violet },
                            }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={chart.tick}
                            stroke={chart.teal}
                            label={{
                                value: normalized ? '%' : dependentUnit,
                                angle: 90,
                                position: 'insideRight',
                                style: { fontSize: 12, fill: chart.teal },
                            }}
                        />
                        <Tooltip
                            contentStyle={chart.tooltip}
                            formatter={(value, name, props) => {
                                if (typeof value !== 'number') return ['No data', name];
                                const label = name === 'independent' ? independentName : dependentName;
                                const isWashout = props.payload?.isWashout;
                                const condition = props.payload?.condition;

                                let finalName = label;
                                if (isWashout) finalName += ' (Washout)';
                                else if (condition) {
                                    if (isBlind) {
                                        const idx = conditionLabels?.indexOf(condition);
                                        finalName += ` [Cond ${idx != null && idx >= 0 ? idx + 1 : condition}]`;
                                    } else {
                                        finalName += ` [${condition}]`;
                                    }
                                }

                                return [
                                    `${value.toFixed(1)}${normalized ? '%' : ''}`,
                                    finalName,
                                ];
                            }}
                            labelFormatter={(label) => formatDate(label as string)}
                        />
                        <Bar
                            yAxisId="left"
                            dataKey="independent"
                            name="independent"
                            fill={chart.violet}
                            opacity={0.8}
                            radius={[2, 2, 0, 0]}
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="dependent"
                            name="dependent"
                            stroke={chart.teal}
                            strokeWidth={3}
                            dot={{ fill: chart.teal, strokeWidth: 0, r: 4 }}
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Missing Data Warning */}
            {data.some(d => d.independent === null || d.dependent === null) && (
                <div className="p-3 rounded-[var(--radius-card)] bg-[var(--color-amber)]/10 border border-[var(--color-amber)]/40 text-sm text-[var(--color-amber)]">
                    Some days have missing data. Gaps in the chart indicate days without logged values.
                </div>
            )}
        </div>
    );
}
