'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clockLabel, windowFor, type Dose } from '@/lib/levels';

/**
 * The Levels chart, drawn the way the dot-matrix planners draw it: nothing but a
 * baseline, five bare hour labels, one dotted floor line, and two callouts with
 * hairlines. The data itself is a dot grid: every 8 px cell is a dot, and a dose
 * brightens the cells beneath its own curve, most at the curve and fading to
 * nothing at the baseline, so the top edge reads as the line without drawing one.
 *
 * Drawn on a canvas because the fade is per dot: a pattern fill or an area
 * gradient cannot vary with each cell's height inside its own column. The chrome
 * (labels, leaders, markers) is SVG on top, so text stays crisp.
 */

export interface CurveDose extends Dose {
    /** Planned doses are drawn in the accent colour, logged ones in bone. */
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

const PITCH = 8;
const DOT = 4;
const MAX_ALPHA = 0.8;
const MIN_ALPHA = 0.06;
const BG_ALPHA = 0.022;
const LABEL_LEADER = 34;

const BONE = '242, 241, 238';
const ACCENT = '157, 159, 255';
const AXIS = 'rgba(242, 241, 238, 0.18)';
const LEADER = 'rgba(242, 241, 238, 0.28)';
const MUTED = '#8e8d8b';
const BRIGHT = '#f2f1ee';
const MONO = 'var(--font-geist-mono), ui-monospace, monospace';

const HOURS = [6, 12, 18, 24, 30];

function niceCeiling(value: number) {
    if (value <= 0) return 100;
    const step = value > 400 ? 100 : value > 150 ? 50 : 25;
    return Math.ceil((value * 1.06) / step) * step;
}

function useWidth<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [ref, width] as const;
}

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
    const [container, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const narrow = width > 0 && width < 520;
    const layout = useMemo(() => {
        const left = 4;
        const right = Math.max(120, width - (narrow ? 34 : 54));
        const top = narrow ? 86 : 54;
        const bottom = height - 60;
        return { left, right, top, bottom, plotWidth: Math.max(0, right - left), plotHeight: Math.max(0, bottom - top) };
    }, [height, narrow, width]);

    const maxLevel = useMemo(() => niceCeiling(Math.max(peak?.value ?? 0, floor * 1.6)), [floor, peak?.value]);

    const offsetOf = useCallback(
        (time: number) => ((time - start) / 60_000 / 1440) * layout.plotWidth,
        [layout.plotWidth, start]
    );

    // The matrix. The field reaches the summed curve, and every dot is a fixed
    // fraction of its own column height: brightest at the curve, dimmest on the
    // axis, with a floor so the field never dissolves before the baseline. The
    // band above what is already logged is the accent, so a planned dose reads as
    // a cap on top of the day you have had.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || width <= 0) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        const { left, bottom, plotHeight, plotWidth } = layout;
        const pxPerUnit = plotHeight / maxLevel;
        const scaleTime = (column: number) => start + ((column - left) / plotWidth) * 1440 * 60_000;

        for (let x = left; x <= left + plotWidth; x += PITCH) {
            const at = scaleTime(x);
            let logged = 0;
            let planned = 0;
            for (const dose of doses) {
                const hoursSince = (at - dose.at) / 3_600_000;
                if (hoursSince <= 0) continue;
                const level = dose.amount * Math.pow(2, -hoursSince / halfLifeHours);
                if (dose.planned) planned += level;
                else logged += level;
            }

            const total = Math.min(plotHeight, (logged + planned) * pxPerUnit);
            const loggedHeight = Math.min(total, logged * pxPerUnit);

            for (let yHeight = 0; yHeight <= total; yHeight += PITCH) {
                const ratio = total > 0 ? yHeight / total : 0;
                // The reference fades fast: bright along the curve, dark by the
                // middle, still faintly there on the axis.
                const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.pow(ratio, 1.55);
                const y = bottom - yHeight - DOT;
                const isPlanned = planned > 0 && yHeight > loggedHeight;
                context.fillStyle = `rgba(${isPlanned ? ACCENT : BONE}, ${alpha.toFixed(3)})`;
                context.fillRect(x, y, DOT, DOT);
            }

            // Where an earlier dose's own curve ends, the field steps down: that
            // edge is what makes several cups readable as several cups.
            for (const dose of doses) {
                const hoursSince = (at - dose.at) / 3_600_000;
                if (hoursSince <= 0) continue;
                const height = dose.amount * Math.pow(2, -hoursSince / halfLifeHours) * pxPerUnit;
                if (height <= 0 || height >= total - PITCH) continue;
                context.fillStyle = `rgba(${dose.planned ? ACCENT : BONE}, 0.16)`;
                context.fillRect(x, bottom - height - DOT, DOT, DOT);
            }
        }

        // The empty grid, so an untouched day still looks like paper.
        context.fillStyle = `rgba(${BONE}, ${BG_ALPHA})`;
        for (let x = left; x <= left + plotWidth; x += PITCH) {
            for (let yHeight = 0; yHeight <= plotHeight; yHeight += PITCH) {
                context.fillRect(x, bottom - yHeight - DOT, DOT, DOT);
            }
        }
    }, [doses, halfLifeHours, height, layout, maxLevel, start, width]);

    const hourTicks = useMemo(() => {
        const dayOpenMinutes = ((new Date(start).getHours() * 60 + new Date(start).getMinutes()) % 1440);
        return HOURS.map((hour) => {
            const minutes = hour * 60;
            const offsetMinutes = minutes - dayOpenMinutes;
            return { hour: hour % 24, offset: (offsetMinutes / 1440) * layout.plotWidth, inRange: offsetMinutes >= 0 && offsetMinutes <= 1440 };
        }).filter((tick) => tick.inRange);
    }, [layout.plotWidth, start]);

    const floorY = layout.bottom - (floor / maxLevel) * layout.plotHeight;
    const bedX = offsetOf(start + bedtimeMinutes * 60_000);
    const nowX = offsetOf(now);

    const labelFont = narrow ? 11 : 12;
    const bedTextWidth = Math.round((`${Math.round(bedtimeLevel)} ${unit.toUpperCase()} STILL IN YOU`.length) * labelFont * 0.62);
    const peakTextWidth = Math.round(11 * labelFont * 0.62);
    const peakLabel = peak ? { x: clamp(offsetOf(peak.t), layout.left, layout.right - peakTextWidth), time: peak.t } : null;
    const bedLabel = {
        x: narrow
            ? Math.max(layout.left, layout.right - bedTextWidth)
            : clamp(bedX, layout.left, layout.right - bedTextWidth),
        minutes: bedtimeMinutes,
    };
    const labelRowY = labelledTop(bedLabel.x, peakLabel?.x, layout.plotWidth);

    const lastCupLabel = lastDoseBy === null ? 'NO CUP TODAY' : `LAST CUP BY ${clockLabel(minutesOf(lastDoseBy))}`;
    const clearsLabel = clearsBy === null ? 'STILL OVER THE FLOOR AT DAWN' : `CLEARS ${clockLabel(minutesOf(clearsBy))}`;

    return (
        <div ref={container} className="relative w-full" style={{ height }}>
            <canvas ref={canvasRef} className="absolute inset-0" style={{ width: '100%', height }} aria-hidden />

            <svg width={width} height={height} className="absolute inset-0" role="img" aria-label={ariaLabel(peak, bedtimeLevel, floor, unit)}>
                {/* floor: a dotted line, labelled once at the end */}
                {Array.from({ length: Math.floor(layout.plotWidth / 6) + 1 }, (_, index) => (
                    <rect
                        key={`floor-${index}`}
                        x={layout.left + index * 6}
                        y={floorY}
                        width={1}
                        height={1}
                        fill="rgba(242, 241, 238, 0.22)"
                    />
                ))}
                <text x={layout.right + 12} y={floorY + 4} fill={MUTED} fontFamily={MONO} fontSize={11}>
                    {floor}
                </text>

                {/* baseline and its hour labels */}
                <line x1={layout.left} y1={layout.bottom} x2={layout.right} y2={layout.bottom} stroke={AXIS} strokeWidth={1} />
                {hourTicks.map((tick) => (
                    <g key={`hour-${tick.hour}-${tick.offset}`}>
                        <line
                            x1={layout.left + tick.offset}
                            y1={layout.bottom}
                            x2={layout.left + tick.offset}
                            y2={layout.bottom + 5}
                            stroke={AXIS}
                            strokeWidth={1}
                        />
                        <text
                            x={layout.left + tick.offset}
                            y={layout.bottom + 24}
                            fill={MUTED}
                            fontFamily={MONO}
                            fontSize={11}
                            textAnchor="middle"
                        >
                            {String(tick.hour).padStart(2, '0')}
                        </text>
                    </g>
                ))}

                {/* now, when it falls inside the day */}
                {nowX > layout.left && nowX < layout.right && (
                    <line x1={nowX} y1={layout.top} x2={nowX} y2={layout.bottom} stroke="rgba(245, 181, 74, 0.22)" strokeWidth={1} />
                )}

                {/* bed: leader down the whole plot, callout on top */}
                <line x1={bedLabel.x} y1={labelRowY} x2={bedLabel.x} y2={layout.bottom} stroke={LEADER} strokeWidth={1} />
                <text x={bedLabel.x + 3} y={labelRowY - 24} fill={BRIGHT} fontFamily={MONO} fontSize={labelFont} letterSpacing="0.1em">
                    {`BED ${clockLabel(bedLabel.minutes)}`}
                </text>
                <text x={bedLabel.x + 3} y={labelRowY - 8} fill={MUTED} fontFamily={MONO} fontSize={labelFont} letterSpacing="0.05em">
                    {`${Math.round(bedtimeLevel)} ${unit.toUpperCase()} STILL IN YOU`}
                </text>

                {/* peak: short leader from the callout down to the curve */}
                {peakLabel && peak && (
                    <g>
                        <line
                            x1={peakLabel.x}
                            y1={layout.top - LABEL_LEADER + 26}
                            x2={peakLabel.x}
                            y2={layout.bottom - (peak.value / maxLevel) * layout.plotHeight}
                            stroke={LEADER}
                            strokeWidth={1}
                        />
                        <text x={peakLabel.x + 6} y={layout.top - LABEL_LEADER} fill={BRIGHT} fontFamily={MONO} fontSize={labelFont} letterSpacing="0.1em">
                            {`PEAK ${Math.round(peak.value)} ${unit.toUpperCase()}`}
                        </text>
                        <text x={peakLabel.x + 6} y={layout.top - LABEL_LEADER + 16} fill={MUTED} fontFamily={MONO} fontSize={labelFont} letterSpacing="0.05em">
                            {clockLabel(minutesOf(peak.t))}
                        </text>
                    </g>
                )}

                {/* a dot per dose, on the baseline, where it lands */}
                {doses
                    .filter((dose) => offsetOf(dose.at) >= layout.left && offsetOf(dose.at) <= layout.right)
                    .map((dose) => (
                        <circle
                            key={`marker-${dose.id}`}
                            cx={offsetOf(dose.at)}
                            cy={layout.bottom}
                            r={6}
                            fill={dose.planned ? '#9d9fff' : '#e6e4de'}
                            stroke={dose.planned ? 'rgba(18, 19, 22, 0.9)' : 'rgba(18, 19, 22, 0.75)'}
                            strokeWidth={1.5}
                        />
                    ))}
            </svg>

            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-baseline justify-between px-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-primary)]">
                    {lastCupLabel}
                    <span className="ml-3 text-[var(--text-tertiary)]">{clearsLabel}</span>
                </span>
            </div>
        </div>
    );
}

function labelledTop(bedX: number, peakX: number | undefined, plotWidth: number) {
    // Keep the two callouts from sitting on top of each other.
    const threshold = Math.min(190, plotWidth * 0.46);
    return peakX !== undefined && Math.abs(bedX - peakX) < threshold ? 118 : 78;
}

function minutesOf(time: number) {
    const date = new Date(time);
    return date.getHours() * 60 + date.getMinutes();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function ariaLabel(peak: { t: number; value: number } | null, bedtimeLevel: number, floor: number, unit: string) {
    const peakPart = peak ? `peak ${Math.round(peak.value)} ${unit} at ${clockLabel(minutesOf(peak.t))}` : 'no dose logged';
    return `Substance level through the day: ${peakPart}, ${Math.round(bedtimeLevel)} ${unit} at bedtime against a ${floor} ${unit} floor.`;
}

export { windowFor };
