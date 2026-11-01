'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
    content: string;
    children?: React.ReactNode;
    className?: string;
}

export function Tooltip({ content, children, className = '' }: TooltipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <span className={`relative inline-flex items-center ${className}`} ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors focus:outline-none"
                aria-label="More info"
            >
                {children || <HelpCircle className="h-4 w-4" />}
            </button>
            {open && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 max-w-[85vw] px-3 py-2 text-xs text-[var(--color-on-accent)] bg-[var(--color-text-primary)] rounded-[var(--radius-input)] shadow-[var(--shadow-elevated)] pointer-events-none animate-fade-in font-body">
                    {content}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-[var(--color-text-primary)]" />
                </div>
            )}
        </span>
    );
}

interface InfoTooltipProps {
    text: string;
    className?: string;
}

export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
    return <Tooltip content={text} className={className} />;
}
