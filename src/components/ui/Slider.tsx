'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    labels?: string[];
    ariaLabel?: string;
    className?: string;
}

export const Slider = ({
    value,
    onChange,
    min = 0,
    max = 10,
    step = 1,
    labels,
    ariaLabel,
    className
}: SliderProps) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className={cn("w-full py-4", className)}>
            <div className="relative h-12 flex items-center select-none touch-none group">
                {/* Track Background */}
                <div className="absolute w-full h-3 bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
                    {/* Active Track */}
                    <div
                        className="h-full bg-[var(--color-accent)] transition-all duration-150 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                {/* Thumb */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    aria-label={ariaLabel}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                />

                {/* Visual Thumb (follows position) */}
                <div
                    className="absolute h-8 w-8 bg-[var(--color-bg-card)] border-2 border-[var(--color-accent)] rounded-full shadow-[var(--shadow-card)] z-10 pointer-events-none transition-all duration-150 ease-out flex items-center justify-center text-xs font-bold text-[var(--color-accent)] group-active:scale-110"
                    style={{ left: `calc(${percentage}% - 16px)` }}
                >
                    {value}
                </div>
            </div>

            {/* Labels */}
            {labels && (
                <div className="flex justify-between mt-2 px-1">
                    {labels.map((label, i) => (
                        <span
                            key={i}
                            className={cn(
                                "text-xs font-medium transition-colors",
                                (i === 0 && value <= min + (max - min) * 0.3) || (i === labels.length - 1 && value >= max - (max - min) * 0.3)
                                    ? "text-[var(--color-accent)]"
                                    : "text-[var(--color-text-tertiary)]"
                            )}
                        >
                            {label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
