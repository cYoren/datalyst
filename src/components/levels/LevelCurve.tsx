'use client';

import React, { useMemo } from 'react';
import { DotAreaChart, type DotCallout, type DotSeries } from '@/components/charts/DotAreaChart';
import { clockLabel, type Dose } from '@/lib/levels';

/**
 * Levels on the house chart: one series per dose, stacked bottom to top, logged in
 * bone and planned in the accent. Everything the panel knows (peak, bedtime,
 * floor, last cup) is handed to the chart as a callout, a rule or a footnote;
 * none of the drawing lives here.
 */

export interface CurveDose extends Dose {
    planned?: boolean;
}

interface LevelCurveProps {
    doses: CurveDose[];
    halfLifeHours: number;
    floor: number;
    unit: string;
    bedtimeMinutes: number;
    start: number;
    now: number;
    height?: number;
    lastDoseBy: number | null;
    clearsBy: number | null;
    peak: { t: number; value: number } | null;
    bedtimeLevel: number;
}

const BONE = '242, 241, 238';
const ACCENT = '157, 159, 255';
const DAY = 24 * 3_600_000;
const SAMPLE_MS = 5 * 60_000;
const HOURS = [6, 12, 18, 24];

export function LevelCurve({
    doses,
    halfLifeHours,
    floor,
    unit,
    bedtimeMinutes,
    start,
    now,
    height = 320,
    lastDoseBy,
    clearsBy,
    peak,
    bedtimeLevel,
}: LevelCurveProps) {
    const end = start + DAY;

    const series = useMemo<DotSeries[]>(
        () =>
            [...doses]
                .sort((a, b) => a.at - b.at)
                .map((dose) => {
                    const points: Array<{ x: number; y: number }> = [];
                    for (let at = dose.at; at <= end; at += SAMPLE_MS) {
                        const hoursSince = (at - dose.at) / 3_600_000;
                        points.push({ x: at, y: dose.amount * Math.pow(2, -hoursSince / halfLifeHours) });
                    }
                    return {
                        id: dose.id,
                        color: dose.planned ? ACCENT : BONE,
                        points,
                    };
                }),
        [doses, end, halfLifeHours]
    );

    const axisLabels = useMemo(
        () =>
            HOURS.map((hour) => ({
                x: start + hour * 3_600_000,
                text: String(hour % 24).padStart(2, '0'),
            })),
        [start]
    );

    const callouts = useMemo<DotCallout[]>(() => {
        const list: DotCallout[] = [];
        if (peak) {
            list.push({
                x: peak.t,
                title: `PEAK ${Math.round(peak.value)} ${unit.toUpperCase()}`,
                detail: clockLabel(minutesOf(peak.t)),
                to: peak.value,
            });
        }
        list.push({
            x: start + bedtimeMinutes * 60_000,
            title: `BED ${clockLabel(bedtimeMinutes)}`,
            detail: `${Math.round(bedtimeLevel)} ${unit.toUpperCase()} STILL IN YOU`,
        });
        return list;
    }, [bedtimeLevel, bedtimeMinutes, peak, start, unit]);

    const lastCup = lastDoseBy === null ? 'NO CUP TODAY' : `LAST CUP BY ${clockLabel(minutesOf(lastDoseBy))}`;
    const clears = clearsBy === null ? 'STILL OVER THE FLOOR AT DAWN' : `CLEARS ${clockLabel(minutesOf(clearsBy))}`;

    return (
        <DotAreaChart
            series={series}
            min={start}
            max={end}
            verticals={[{ x: now }]}
            height={height}
            axisLabels={axisLabels}
            rules={[{ y: floor, label: String(floor) }]}
            callouts={callouts}
            markers={doses.map((dose) => ({ x: dose.at, color: dose.planned ? ACCENT : undefined }))}
            ariaLabel={ariaLabel(peak, bedtimeLevel, floor, unit)}
            footnote={
                <>
                    <span className="uppercase tracking-[0.08em] text-[var(--text-primary)]">
                        {lastCup}
                        <span className="ml-3 text-[var(--text-tertiary)]">{clears}</span>
                    </span>
                </>
            }
        />
    );
}

function minutesOf(time: number) {
    const date = new Date(time);
    return date.getHours() * 60 + date.getMinutes();
}

function ariaLabel(
    peak: { t: number; value: number } | null,
    bedtimeLevel: number,
    floor: number,
    unit: string
) {
    const peakPart = peak
        ? `peak ${Math.round(peak.value)} ${unit} at ${clockLabel(minutesOf(peak.t))}`
        : 'no dose logged';
    return `Substance level through the day: ${peakPart}, ${Math.round(bedtimeLevel)} ${unit} at bedtime against a ${floor} ${unit} floor.`;
}
