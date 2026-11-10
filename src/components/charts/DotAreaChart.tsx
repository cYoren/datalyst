'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildColumns, cellAlpha, niceCeiling, type DotSeries } from '@/lib/dotMatrix';

export type { DotSeries };

/**
 * DotAreaChart: the house chart.
 *
 * Everything about a quantity over time is drawn the same way, and it is drawn
 * from that quantity alone: stacked series become a dot matrix that is brightest
 * on the curve, fades to a dim floor on the baseline, and steps brighter where
 * each series' own top edge lands. There is no gridline, no y axis and no stroke
 * on the curve; the chrome is a baseline, bare tick labels, dotted reference
 * lines labelled once at the right, optional callouts on hairlines, and optional
 * markers sitting on the axis.
 *
 * Canvas for the matrix, because the fade is per cell: a pattern fill or an area
 * gradient cannot vary with each cell's height inside its own column. SVG on top
 * for type, so text stays crisp.
 */

export interface DotRule {
    /** Position on the y axis. */
    y: number;
    /** Shown once, at the right of the line. */
    label?: string;
}

export interface DotCallout {
    /** Position on the x axis the hairline hangs from. */
    x: number;
    title: string;
    detail?: string;
    /** Where the hairline ends, in y units. Defaults to the baseline. */
    to?: number;
}

export interface DotVertical {
    x: number;
    /** rgba() string; a dim accent by default. */
    stroke?: string;
}

export interface DotMarker {
    x: number;
    color?: string;
}

export interface DotAxisLabel {
    x: number;
    text: string;
    tick?: boolean;
}

interface DotAreaChartProps {
    series: DotSeries[];
    /** x domain, in the caller's units. */
    min: number;
    max: number;
    /** Optional cap; computed from the data when omitted. */
    yMax?: number;
    height?: number;
    axisLabels?: DotAxisLabel[];
    rules?: DotRule[];
    verticals?: DotVertical[];
    callouts?: DotCallout[];
    markers?: DotMarker[];
    /** Rendered under the axis, left and right. */
    footnote?: React.ReactNode;
    ariaLabel: string;
    className?: string;
}

const PITCH = 8;
const DOT = 4;
const BONE = '242, 241, 238';
const AXIS = 'rgba(242, 241, 238, 0.18)';
const LEADER = 'rgba(242, 241, 238, 0.28)';
const MUTED = '#8e8d8b';
const BRIGHT = '#f2f1ee';
const MONO = 'var(--font-geist-mono), ui-monospace, monospace';

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

export function DotAreaChart({
    series,
    min,
    max,
    yMax,
    height = 320,
    axisLabels = [],
    rules = [],
    verticals = [],
    callouts = [],
    markers = [],
    footnote,
    ariaLabel,
    className,
}: DotAreaChartProps) {
    const [container, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const narrow = width > 0 && width < 520;

    const horizontal = useMemo(() => {
        const left = 4;
        const widestRule = rules.reduce((widest, rule) => Math.max(widest, rule.label?.length ?? 0), 0);
        const gutter = Math.max(narrow ? 34 : 54, Math.round(widestRule * 6.8) + 20);
        const right = Math.max(120, width - gutter);
        return { left, right, plotWidth: Math.max(0, right - left) };
    }, [narrow, rules, width]);

    const xOf = useCallback(
        (value: number) => horizontal.left + ((value - min) / (max - min || 1)) * horizontal.plotWidth,
        [horizontal.left, horizontal.plotWidth, max, min]
    );

    // Callouts place themselves: left to right, first row whose span they do not
    // overlap, so a peak near bedtime never lands on top of it. Rows are decided
    // from x alone, which lets the box below reserve exactly that much band.
    const fontSize = narrow ? 11 : 12;
    const calloutLayout = useMemo(() => {
        const placed: Array<{ from: number; to: number; row: number }> = [];
        return [...callouts]
            .sort((a, b) => a.x - b.x)
            .map((callout) => {
                const widest = Math.max(callout.title.length, callout.detail?.length ?? 0);
                const extent = widest * fontSize * 0.66 + 10;
                const x = clamp(xOf(callout.x), horizontal.left, Math.max(horizontal.left, horizontal.right - extent));
                let row = 0;
                while (placed.some((item) => item.row === row && x < item.to && x + extent > item.from)) row += 1;
                placed.push({ from: x, to: x + extent, row });
                return { ...callout, x, row, textX: x + 4 };
            });
    }, [callouts, fontSize, horizontal.left, horizontal.right, xOf]);

    const calloutRows = calloutLayout.reduce((rows, callout) => Math.max(rows, callout.row), -1) + 1;

    const layout = useMemo(() => {
        const top = 10 + calloutRows * 38 + (narrow ? 24 : 16);
        const bottom = height - (narrow ? 78 : 60);
        return {
            ...horizontal,
            top,
            bottom,
            plotHeight: Math.max(0, bottom - top),
        };
    }, [calloutRows, height, horizontal, narrow]);

    const columns = useMemo(() => {
        const count = Math.max(1, Math.floor(layout.plotWidth / PITCH));
        return buildColumns(series, min, max, count);
    }, [layout.plotWidth, max, min, series]);

    // The ceiling comes from the stacked totals. The callouts already sit above the
    // plot box, so the only headroom needed here is the readability one.
    const ceiling = useMemo(() => {
        if (yMax) return yMax;
        const highest = columns.reduce((top, column) => Math.max(top, column.total), 0);
        return niceCeiling(highest);
    }, [columns, yMax]);

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

        const { bottom, plotHeight } = layout;
        const pxPerUnit = plotHeight / ceiling;

        // The empty grid first, so an untouched range still looks like paper.
        context.fillStyle = `rgba(${BONE}, 0.022)`;
        for (let yHeight = 0; yHeight <= plotHeight; yHeight += PITCH) {
            for (let x = layout.left; x <= layout.left + layout.plotWidth; x += PITCH) {
                context.fillRect(x, bottom - yHeight - DOT, DOT, DOT);
            }
        }

        const toPixel = (value: number) => layout.left + ((value - min) / (max - min || 1)) * layout.plotWidth;

        for (const column of columns) {
            const px = toPixel(column.x);
            if (px < layout.left || px > layout.left + layout.plotWidth) continue;
            const total = Math.min(plotHeight, column.total * pxPerUnit);
            if (total <= 0) continue;

            for (let yHeight = 0; yHeight <= total; yHeight += PITCH) {
                const owner = column.layers.find((layer) => yHeight <= layer.to * pxPerUnit) ?? column.layers[column.layers.length - 1];
                if (!owner) continue;
                const alpha = cellAlpha(yHeight, total);
                context.fillStyle = `rgba(${owner.color}, ${alpha.toFixed(3)})`;
                context.fillRect(px, bottom - yHeight - DOT, DOT, DOT);
            }

            // The edge of each series inside the stack: the step that keeps
            // several things readable as several.
            for (const layer of column.layers) {
                const edgeHeight = Math.min(total, layer.to * pxPerUnit);
                if (!layer.edge || edgeHeight <= 0 || edgeHeight >= total - PITCH) continue;
                context.fillStyle = `rgba(${layer.color}, 0.16)`;
                context.fillRect(px, bottom - edgeHeight - DOT, DOT, DOT);
            }
        }
    }, [ceiling, columns, height, layout, max, min, width]);

    const yOf = useCallback(
        (value: number) => layout.bottom - (value / ceiling) * layout.plotHeight,
        [ceiling, layout.bottom, layout.plotHeight]
    );


    return (
        <div ref={container} className={['relative w-full', className].filter(Boolean).join(' ')} style={{ height }}>
            <canvas ref={canvasRef} className="absolute inset-0" style={{ width: '100%', height }} aria-hidden />

            <svg width={width} height={height} className="absolute inset-0" role="img" aria-label={ariaLabel}>
                {rules.map((rule) => (
                    <g key={`rule-${rule.y}`}>
                        {Array.from({ length: Math.floor(layout.plotWidth / 6) + 1 }, (_, index) => (
                            <rect
                                key={index}
                                x={layout.left + index * 6}
                                y={yOf(rule.y)}
                                width={1}
                                height={1}
                                fill="rgba(242, 241, 238, 0.22)"
                            />
                        ))}
                        {rule.label && (
                            <text x={layout.right + 12} y={yOf(rule.y) + 4} fill={MUTED} fontFamily={MONO} fontSize={11}>
                                {rule.label}
                            </text>
                        )}
                    </g>
                ))}

                {verticals
                    .filter((vertical) => xOf(vertical.x) >= layout.left && xOf(vertical.x) <= layout.right)
                    .map((vertical, index) => (
                        <line
                            key={`vertical-${vertical.x}-${index}`}
                            x1={xOf(vertical.x)}
                            y1={layout.top}
                            x2={xOf(vertical.x)}
                            y2={layout.bottom}
                            stroke={vertical.stroke ?? 'rgba(245, 181, 74, 0.22)'}
                            strokeWidth={1}
                        />
                    ))}

                <line x1={layout.left} y1={layout.bottom} x2={layout.right} y2={layout.bottom} stroke={AXIS} strokeWidth={1} />

                {axisLabels.map((label) => {
                    const at = xOf(label.x);
                    const anchor = at - horizontal.left < 18 ? 'start' : horizontal.right - at < 18 ? 'end' : 'middle';
                    return (
                    <g key={`axis-${label.x}-${label.text}`}>
                        {label.tick !== false && (
                            <line
                                x1={xOf(label.x)}
                                y1={layout.bottom}
                                x2={xOf(label.x)}
                                y2={layout.bottom + 5}
                                stroke={AXIS}
                                strokeWidth={1}
                            />
                        )}
                        <text
                            x={at}
                            y={layout.bottom + 24}
                            fill={MUTED}
                            fontFamily={MONO}
                            fontSize={11}
                            textAnchor={anchor}
                        >
                            {label.text}
                        </text>
                    </g>
                    );
                })}

                {calloutLayout.map((callout) => {
                    const rowY = 22 + callout.row * 38;
                    const anchor = callout.to !== undefined ? yOf(callout.to) : layout.bottom;
                    return (
                        <g key={`callout-${callout.title}-${callout.x}`}>
                            <line x1={callout.x} y1={rowY + 22} x2={callout.x} y2={anchor} stroke={LEADER} strokeWidth={1} />
                            <text
                                x={callout.textX}
                                y={rowY}
                                fill={BRIGHT}
                                fontFamily={MONO}
                                fontSize={fontSize}
                                letterSpacing="0.1em"
                            >
                                {callout.title}
                            </text>
                            {callout.detail && (
                                <text
                                    x={callout.textX}
                                    y={rowY + 16}
                                    fill={MUTED}
                                    fontFamily={MONO}
                                    fontSize={fontSize}
                                    letterSpacing="0.05em"
                                >
                                    {callout.detail}
                                </text>
                            )}
                        </g>
                    );
                })}

                {markers
                    .filter((marker) => xOf(marker.x) >= layout.left && xOf(marker.x) <= layout.right)
                    .map((marker, index) => (
                        <circle
                            key={`marker-${marker.x}-${index}`}
                            cx={xOf(marker.x)}
                            cy={layout.bottom}
                            r={6}
                            fill={marker.color ? `rgb(${marker.color})` : '#e6e4de'}
                            stroke="rgba(18, 19, 22, 0.75)"
                            strokeWidth={1.5}
                        />
                    ))}
            </svg>

            {footnote && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-baseline justify-between px-1 font-mono text-[11px]">
                    {footnote}
                </div>
            )}
        </div>
    );
}

function clamp(value: number, low: number, high: number) {
    return Math.min(Math.max(value, low), Math.max(low, high));
}
