'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, Tag, ArrowLeft, Loader2, BookOpen } from 'lucide-react';
import { HABIT_TEMPLATES, PROTOCOL_BUNDLES } from '@/lib/templates';

interface Template {
    id: string;
    name: string;
    icon: string;
    color: string;
    description?: string;
    useCount?: number;
    subvariables: TemplateSubvariable[];
    source: 'starter' | 'user';
}

interface TemplateSubvariable {
    name: string;
    type: string;
    unit?: string | null;
    order?: number;
    metadata?: Record<string, unknown>;
}

interface RawUserTemplate {
    id: string;
    name: string;
    icon: string;
    color: string;
    description?: string;
    useCount?: number;
    subvariableTemplate?: TemplateSubvariable[];
}

export default function TemplateLibraryPage() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [userTemplates, setUserTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [creating, setCreating] = useState<string | null>(null);

    // Fetch user-created templates
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/templates');
                if (res.ok) {
                    const data: unknown = await res.json();
                    if (Array.isArray(data)) {
                        setUserTemplates(data.map((item) => {
                            const t = item as RawUserTemplate;
                            return {
                            id: t.id,
                            name: t.name,
                            icon: t.icon,
                            color: t.color,
                            description: t.description,
                            useCount: t.useCount,
                            subvariables: t.subvariableTemplate || [],
                            source: 'user' as const,
                            };
                        }));
                    }
                }
            } catch { /* ignore */ }
            setIsLoading(false);
        })();
    }, []);

    // Merge starter + user templates
    const starterTemplates: Template[] = useMemo(() =>
        HABIT_TEMPLATES.map(t => ({
            id: `starter-${t.id}`,
            name: t.name,
            icon: t.icon,
            color: t.color,
            description: t.description,
            subvariables: t.subvariables.map(s => ({ name: s.name, type: s.type, unit: s.unit })),
            source: 'starter' as const,
        })),
        []
    );

    const allTemplates = useMemo(() => [...starterTemplates, ...userTemplates], [starterTemplates, userTemplates]);

    const filtered = useMemo(() => {
        if (!query) return allTemplates;
        const q = query.toLowerCase();
        return allTemplates.filter(t =>
            t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
        );
    }, [allTemplates, query]);

    const handleUseTemplate = async (template: Template) => {
        setCreating(template.id);
        try {
            // Find the raw template data
            const rawStarter = HABIT_TEMPLATES.find(t => `starter-${t.id}` === template.id);

            const body: {
                name: string;
                icon: string;
                color: string;
                scheduleType: 'DAILY';
                scheduleDays: number[];
                subvariables: TemplateSubvariable[];
            } = {
                name: rawStarter?.name || template.name,
                icon: template.icon,
                color: template.color,
                scheduleType: 'DAILY',
                scheduleDays: [0, 1, 2, 3, 4, 5, 6],
                subvariables: (rawStarter?.subvariables || template.subvariables).map((s, i) => ({
                    name: s.name,
                    type: s.type,
                    unit: s.unit || null,
                    order: s.order ?? i,
                    metadata: s.metadata || {},
                })),
            };

            const res = await fetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                router.push('/dashboard');
            }
        } catch (err) {
            console.error('Failed to create from template:', err);
        } finally {
            setCreating(null);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-[var(--radius-card)] border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)]">
                        <BookOpen className="h-5 w-5 text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)]">Template Library</h1>
                        <p className="text-sm text-[var(--text-secondary)]">Pre-built trackers ready to use</p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search templates..."
                    className="pl-10"
                />
            </div>

            {/* Bundles Section */}
            {!query && (
                <section className="space-y-3">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                        Tracker bundles
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Sets of 2-3 trackers designed to reveal correlations together.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {PROTOCOL_BUNDLES.map(bundle => {
                            const protocols = bundle.protocolIds
                                .map(pid => HABIT_TEMPLATES.find(t => t.id === pid))
                                .filter(Boolean);
                            return (
                                <Card key={bundle.id} className="p-4 space-y-2  transition-shadow">
                                    <div className="flex items-center gap-2">
                                        <TrackerIcon value={bundle.icon} className="h-5 w-5 text-[var(--color-accent)]" />
                                        <h3 className="font-semibold text-[var(--text-primary)]">{bundle.name}</h3>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)]">{bundle.description}</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {protocols.map(p => (
                                            <span key={p!.id} className="text-sm text-[var(--text-secondary)]">
                                                <TrackerIcon value={p!.icon} className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />{p!.name}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-[var(--text-tertiary)]">{bundle.whyItCorrelates}</p>
                                </Card>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Individual Templates */}
            <section className="space-y-3">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    {query ? `Results (${filtered.length})` : 'All templates'}
                </h2>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-secondary)]">
                        No templates match &quot;{query}&quot;
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {filtered.map(template => (
                            <Card key={template.id} className="p-4 flex items-start gap-3  transition-shadow">
                                <div
                                    className="h-10 w-10 rounded-[var(--radius-card)] flex items-center justify-center text-xl shrink-0"
                                    style={{ backgroundColor: template.color + '20' }}
                                >
                                    <TrackerIcon value={template.icon} className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-semibold text-[var(--text-primary)] truncate">{template.name}</h3>
                                        {template.source === 'user' && (
                                            <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded font-medium shrink-0">
                                                Custom
                                            </span>
                                        )}
                                    </div>
                                    {template.description && (
                                        <p className="text-sm text-[var(--text-secondary)] line-clamp-1">{template.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                                        <Tag className="h-3 w-3" />
                                        <span>{template.subvariables.length} metrics: {template.subvariables.map(s => s.name).join(', ')}</span>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleUseTemplate(template)}
                                        isLoading={creating === template.id}
                                        className="mt-2"
                                    >
                                        Use Template
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
