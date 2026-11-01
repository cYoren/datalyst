'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { Search, Tag, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HABIT_TEMPLATES } from '@/lib/templates';
import { Skeleton } from '@/components/ui/Skeleton';
import type { HabitSchedule, HabitSubvariable } from '@/types';

export interface Template {
    id: string;
    name: string;
    icon: string;
    color: string;
    description?: string;
    useCount: number;
    subvariableTemplate: HabitSubvariable[];
    defaultSchedule?: HabitSchedule;
}

interface TemplateSelectorProps {
    onSelect: (template: Template | null) => void;
    selectedTemplate: Template | null;
}

// Convert static templates to the Template shape
const STARTER_TEMPLATES: Template[] = HABIT_TEMPLATES.map((t) => ({
    id: `starter-${t.id}`,
    name: t.name,
    icon: t.icon,
    color: t.color,
    description: t.description,
    useCount: 0,
    subvariableTemplate: t.subvariables,
}));

export const TemplateSelector = ({ onSelect, selectedTemplate }: TemplateSelectorProps) => {
    const [query, setQuery] = useState('');
    const [dbTemplates, setDbTemplates] = useState<Template[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Filter static templates by query
    const filteredStarter = useMemo(() => {
        if (!query) return STARTER_TEMPLATES;
        const q = query.toLowerCase();
        return STARTER_TEMPLATES.filter(
            (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
        );
    }, [query]);

    useEffect(() => {
        const fetchTemplates = async () => {
            setIsLoading(true);
            try {
                const url = query
                    ? `/api/templates?q=${encodeURIComponent(query)}`
                    : '/api/templates';
                const res = await fetch(url);

                if (!res.ok) {
                    console.error('Failed to fetch templates:', res.status, res.statusText);
                    setDbTemplates([]);
                    return;
                }

                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.error('Response is not JSON:', contentType);
                    setDbTemplates([]);
                    return;
                }

                const data = await res.json();
                setDbTemplates(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to fetch templates:', error);
                setDbTemplates([]);
            } finally {
                setIsLoading(false);
            }
        };

        const debounce = setTimeout(fetchTemplates, 300);
        return () => clearTimeout(debounce);
    }, [query]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (template: Template) => {
        onSelect(template);
        setQuery(template.name);
        setIsOpen(false);
    };

    const handleClear = () => {
        onSelect(null);
        setQuery('');
        setIsOpen(true);
    };

    const renderTemplateRow = (template: Template) => (
        <button
            key={template.id}
            type="button"
            onClick={() => handleSelect(template)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-control-bg-hover)] transition-colors text-left"
        >
            <div
                className="h-10 w-10 rounded-[var(--radius-card)] flex items-center justify-center text-xl flex-shrink-0"
                style={{ backgroundColor: template.color + '20' }}
            >
                <TrackerIcon value={template.icon} className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-[var(--text-primary)] truncate">
                    {template.name}
                </div>
                {template.description && (
                    <div className="text-sm text-[var(--text-secondary)] truncate">
                        {template.description}
                    </div>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" suppressHydrationWarning />
                        {template.subvariableTemplate.length} variables
                    </span>
                    {template.useCount > 0 && (
                        <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" suppressHydrationWarning />
                            Used {template.useCount}x
                        </span>
                    )}
                </div>
            </div>
        </button>
    );

    const hasStarter = filteredStarter.length > 0;
    const hasDb = dbTemplates.length > 0;
    const hasAny = hasStarter || hasDb;

    return (
        <div ref={wrapperRef} className="relative">
            <label className="label-mono mb-2 block">
                Use existing template (optional)
            </label>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" suppressHydrationWarning />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search template or create new..."
                    className={cn(
                        "w-full h-12 pl-10 pr-4 rounded-[var(--radius-card)] border bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)]",
                        "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
                        selectedTemplate
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                            : "border-[var(--color-border)]"
                    )}
                />
                {selectedTemplate && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm font-medium"
                    >
                        Clear
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-[var(--color-bg-card)] border-[var(--color-border)]  max-h-80 overflow-auto">
                    {isLoading && !hasStarter ? (
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-12 w-full rounded-[var(--radius-card)]" />
                            <Skeleton className="h-12 w-full rounded-[var(--radius-card)]" />
                            <Skeleton className="h-12 w-full rounded-[var(--radius-card)]" />
                        </div>
                    ) : !hasAny ? (
                        <div className="p-4 text-center text-[var(--text-secondary)]">
                            {query ? (
                                <>
                                    <p className="mb-2">No templates found.</p>
                                    <p className="text-sm">Keep typing to create a new habit.</p>
                                </>
                            ) : (
                                <p>No templates available.</p>
                            )}
                        </div>
                    ) : (
                        <div className="py-2">
                            {hasStarter && (
                                <>
                                    <div className="px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)]">
                                        Starter Templates
                                    </div>
                                    {filteredStarter.map(renderTemplateRow)}
                                </>
                            )}
                            {hasDb && (
                                <>
                                    <div className={cn(
                                        "px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)]",
                                        hasStarter && "border-t border-[var(--color-border)] mt-1 pt-3"
                                    )}>
                                        My Templates
                                    </div>
                                    {dbTemplates.map(renderTemplateRow)}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {selectedTemplate && (
                <div className="mt-3 p-3 bg-[var(--color-accent-light)] border border-[var(--color-accent)] rounded-[var(--radius-card)]">
                    <div className="flex items-center gap-2 text-sm">
                        <Tag className="h-4 w-4 text-[var(--color-accent)]" suppressHydrationWarning />
                        <span className="font-medium text-[var(--text-primary)]">
                            Using template: {selectedTemplate.name}
                        </span>
                    </div>
                    {selectedTemplate.subvariableTemplate.length > 0 && (
                        <div className="mt-2 text-xs text-[var(--text-secondary)]">
                            Includes: {selectedTemplate.subvariableTemplate.map((s) => s.name).join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
