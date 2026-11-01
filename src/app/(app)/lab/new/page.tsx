'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { FlaskConical, ArrowLeft, Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { fetcher } from '@/lib/hooks';

interface Habit {
    id: string;
    name: string;
    icon: string;
    color: string;
}



export default function NewExperimentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: habits, isLoading } = useSWR<Habit[]>('/api/habits', fetcher);

    const [name, setName] = useState('');
    const [hypothesis, setHypothesis] = useState('');
    const [independentId, setIndependentId] = useState(searchParams.get('independent') || '');
    const [dependentId, setDependentId] = useState(searchParams.get('dependent') || '');
    const [startDate, setStartDate] = useState(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const twoWeeks = new Date();
        twoWeeks.setDate(twoWeeks.getDate() + 15);
        return twoWeeks.toISOString().split('T')[0];
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // N=1 Methodology State
    const [type, setType] = useState<'OBSERVATIONAL' | 'RANDOMIZED' | 'BLIND_RCT'>('OBSERVATIONAL');
    const [randomizationType] = useState<'SIMPLE' | 'BLOCKED'>('BLOCKED');
    const [washoutPeriod, setWashoutPeriod] = useState(2);
    const [blockSize, setBlockSize] = useState(4);
    const [isBlind, setIsBlind] = useState(false);
    const [conditions, setConditions] = useState<{ label: string; dose?: number }[]>([
        { label: 'A' }, { label: 'B' },
    ]);

    // Auto-generate name when pre-filled from query params
    useEffect(() => {
        if (!habits || name) return;
        const indParam = searchParams.get('independent');
        const depParam = searchParams.get('dependent');
        if (indParam && depParam) {
            const indHabit = habits.find(h => h.id === indParam);
            const depHabit = habits.find(h => h.id === depParam);
            if (indHabit && depHabit) {
                setName(`Does ${indHabit.name} affect ${depHabit.name}?`);
            }
        }
    }, [habits, name, searchParams]);

    // Reset blockSize to nearest valid multiple when conditions change
    useEffect(() => {
        const n = conditions.length;
        if (n > 0 && blockSize % n !== 0) {
            setBlockSize(n * 2);
        }
    }, [blockSize, conditions.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        // Validate condition labels for non-observational
        if (type !== 'OBSERVATIONAL') {
            const emptyLabels = conditions.some(c => !c.label.trim());
            if (emptyLabels) {
                setError('All condition labels must be filled in.');
                setIsSubmitting(false);
                return;
            }
        }

        try {
            const res = await fetch('/api/experiments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    hypothesis: hypothesis || null,
                    independentId,
                    dependentId,
                    startDate,
                    endDate,
                    status: 'PLANNING',
                    type,
                    randomizationType,
                    washoutPeriod,
                    blockSize: type === 'OBSERVATIONAL' ? 4 : blockSize,
                    isBlind: type === 'BLIND_RCT' || isBlind,
                    conditions,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create experiment');
            }

            router.push('/lab');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create experiment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredHabits = Array.isArray(habits) ? habits.filter(h => !h.id.includes('archived')) : [];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-[var(--radius-card)] border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)]">
                        <FlaskConical className="h-5 w-5 text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)]">New Experiment</h1>
                        <p className="text-sm text-[var(--text-secondary)]">Test a correlation hypothesis</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Experiment Name */}
                <Card className="p-5 space-y-4">
                    <h2 className="font-semibold text-[var(--text-primary)]">Experiment Details</h2>

                    <div className="space-y-2">
                        <label className="label-mono">
                            Name <span className="text-[var(--color-coral)]">*</span>
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Does Magnesium Improve Sleep?"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="label-mono">
                            Hypothesis (optional)
                        </label>
                        <textarea
                            value={hypothesis}
                            onChange={(e) => setHypothesis(e.target.value)}
                            placeholder="e.g., I expect that taking magnesium before bed will increase my sleep quality score..."
                            className="w-full px-3 py-2 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)] resize-none"
                            rows={3}
                        />
                    </div>
                </Card>

                {/* Variables */}
                <Card className="p-5 space-y-4">
                    <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                        Variables
                        <InfoTooltip text="The independent variable is what you intentionally change (e.g. exercise). The dependent variable is what you expect to be affected (e.g. sleep quality)." />
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Select the independent variable (what you&apos;re changing) and dependent variable (what you&apos;re measuring).
                    </p>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-violet)]" />
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Independent */}
                            <div className="space-y-2">
                                <label className="label-mono">
                                    Daily Intervention (Cause) <span className="text-[var(--color-coral)]">*</span>
                                </label>
                                <select
                                    value={independentId}
                                    onChange={(e) => setIndependentId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)]"
                                    required
                                >
                                    <option value="">Select a protocol...</option>
                                    {filteredHabits.map(habit => (
                                        <option key={habit.id} value={habit.id} disabled={habit.id === dependentId}>
                                            {habit.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-[var(--text-tertiary)]">
                                    The variable you&apos;re manipulating
                                </p>
                            </div>

                            {/* Dependent */}
                            <div className="space-y-2">
                                <label className="label-mono">
                                    Outcome to Measure (Effect) <span className="text-[var(--color-coral)]">*</span>
                                </label>
                                <select
                                    value={dependentId}
                                    onChange={(e) => setDependentId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)]"
                                    required
                                >
                                    <option value="">Select a protocol...</option>
                                    {filteredHabits.map(habit => (
                                        <option key={habit.id} value={habit.id} disabled={habit.id === independentId}>
                                            {habit.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-[var(--text-tertiary)]">
                                    The outcome you&apos;re measuring
                                </p>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Methodology Selection */}
                <Card className="p-5 space-y-4">
                    <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                        Methodology
                        <InfoTooltip text="Choose how rigorous you want your experiment to be." />
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                setType('OBSERVATIONAL');
                                setIsBlind(false);
                            }}
                            className={cn(
                                "p-4 rounded-[var(--radius-card)] border text-left transition-all relative overflow-hidden",
                                type === 'OBSERVATIONAL'
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] bg-opacity-20 ring-1 ring-[var(--color-accent)]"
                                    : "border-[var(--color-border)] hover:border-[var(--text-tertiary)]"
                            )}
                        >
                            <p className="font-bold text-[var(--text-primary)]">Observational</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Just track daily habits and see what correlates naturally.</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setType('RANDOMIZED');
                                setIsBlind(false);
                            }}
                            className={cn(
                                "p-4 rounded-[var(--radius-card)] border text-left transition-all relative overflow-hidden",
                                type === 'RANDOMIZED'
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] bg-opacity-20 ring-1 ring-[var(--color-accent)]"
                                    : "border-[var(--color-border)] hover:border-[var(--text-tertiary)]"
                            )}
                        >
                            <p className="font-bold text-[var(--text-primary)]">Randomized</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Datalyst tells you which condition ({conditions.map(c => c.label).join('/')}) to do each day.</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setType('BLIND_RCT');
                                setIsBlind(true);
                            }}
                            className={cn(
                                "p-4 rounded-[var(--radius-card)] border text-left transition-all relative overflow-hidden",
                                type === 'BLIND_RCT'
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] bg-opacity-20 ring-1 ring-[var(--color-accent)]"
                                    : "border-[var(--color-border)] hover:border-[var(--text-tertiary)]"
                            )}
                        >
                            <p className="font-bold text-[var(--text-primary)]">Label-Hidden</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Condition names hidden during logging (shows &quot;Condition 1/2&quot;). Reduces expectation bias but not true double-blind.</p>
                        </button>
                    </div>

                    {type !== 'OBSERVATIONAL' && (
                        <div className="pt-4 space-y-6 animate-fade-in border-t border-[var(--color-border)] mt-4">
                            {/* Conditions */}
                            <div className="space-y-3">
                                <label className="label-mono flex items-center gap-1">
                                    Conditions
                                    <InfoTooltip text="Define the conditions to compare. Each condition will be randomly assigned across blocks." />
                                </label>
                                <div className="space-y-2">
                                    {conditions.map((cond, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <Input
                                                value={cond.label}
                                                onChange={(e) => {
                                                    const next = [...conditions];
                                                    next[idx] = { ...next[idx], label: e.target.value };
                                                    setConditions(next);
                                                }}
                                                placeholder={`Condition ${idx + 1}`}
                                                className="flex-1"
                                                maxLength={20}
                                            />
                                            <Input
                                                type="number"
                                                value={cond.dose ?? ''}
                                                onChange={(e) => {
                                                    const next = [...conditions];
                                                    next[idx] = { ...next[idx], dose: e.target.value ? Number(e.target.value) : undefined };
                                                    setConditions(next);
                                                }}
                                                placeholder="Dose (optional)"
                                                className="w-32"
                                            />
                                            {conditions.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                                                    className="p-1.5 rounded-md hover:bg-[var(--color-coral)]/10 text-[var(--text-tertiary)] hover:text-[var(--color-coral)] transition-colors"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {conditions.length < 8 && (
                                    <button
                                        type="button"
                                        onClick={() => setConditions([...conditions, { label: '' }])}
                                        className="flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Condition
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {type !== 'OBSERVATIONAL' && (
                        <div className="pt-4 space-y-6 animate-fade-in border-t border-[var(--color-border)] mt-4">
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Randomization Details */}
                                <div className="space-y-3">
                                    <label className="label-mono flex items-center gap-1">
                                        Adaptation Period (Washout)
                                        <InfoTooltip text="Days allowed between condition switches to let the previous intervention leave your system." />
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="0" max="5"
                                            value={washoutPeriod}
                                            onChange={(e) => setWashoutPeriod(parseInt(e.target.value))}
                                            className="flex-1 accent-[var(--color-accent)]"
                                        />
                                        <span className="text-sm font-bold w-12 text-center bg-[var(--color-bg-subtle)] py-1 rounded-md text-[var(--text-primary)]">
                                            {washoutPeriod}d
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="label-mono flex items-center gap-1">
                                        Block Size
                                        <InfoTooltip text="Every block of X days will have an equal split of conditions. Prevents long streaks." />
                                    </label>
                                    <select
                                        value={blockSize}
                                        onChange={(e) => setBlockSize(parseInt(e.target.value))}
                                        className="w-full px-3 py-2 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)]"
                                    >
                                        {Array.from({ length: Math.floor(24 / conditions.length) }, (_, i) => {
                                            const val = (i + 1) * conditions.length;
                                            return (
                                                <option key={val} value={val}>
                                                    {val} Days ({val / conditions.length} per condition)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Date Range */}
                <Card className="p-5 space-y-4">
                    <h2 className="font-semibold text-[var(--text-primary)]">Duration</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Experiments need at least 7 days to calculate meaningful correlations.
                    </p>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="label-mono">
                                Start Date <span className="text-[var(--color-coral)]">*</span>
                            </label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="label-mono">
                                End Date <span className="text-[var(--color-coral)]">*</span>
                            </label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                                required
                            />
                        </div>
                    </div>
                </Card>

                {/* Trial Preview (non-observational only) */}
                {type !== 'OBSERVATIONAL' && startDate && endDate && (() => {
                    const totalDays = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
                    const nConditions = conditions.length;
                    const blocksCount = Math.floor(totalDays / blockSize);
                    const washoutTransitions = Math.max(0, blocksCount * nConditions - 1);
                    const washoutDays = washoutTransitions * washoutPeriod;
                    const treatmentDays = totalDays - washoutDays;
                    const washoutPct = totalDays > 0 ? (washoutDays / totalDays) * 100 : 0;

                    return (
                        <Card className="p-5 space-y-3">
                            <h2 className="font-semibold text-[var(--text-primary)]">Trial Preview</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div className="text-[var(--text-tertiary)] text-xs">Total Days</div>
                                    <div className="font-bold text-[var(--text-primary)]">{totalDays}</div>
                                </div>
                                <div>
                                    <div className="text-[var(--text-tertiary)] text-xs">Treatment Days</div>
                                    <div className="font-bold text-[var(--text-primary)]">~{Math.max(0, treatmentDays)}</div>
                                </div>
                                <div>
                                    <div className="text-[var(--text-tertiary)] text-xs">Washout Days</div>
                                    <div className="font-bold text-[var(--text-primary)]">~{washoutDays}</div>
                                </div>
                                <div>
                                    <div className="text-[var(--text-tertiary)] text-xs">Conditions</div>
                                    <div className="font-bold text-[var(--text-primary)]">{conditions.filter(c => c.label.trim()).map(c => c.label).join(' vs ')}</div>
                                </div>
                            </div>
                            {washoutPct > 40 && (
                                <div className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] bg-[var(--color-amber)]/10 border border-[var(--color-amber)]/40 text-sm text-[var(--color-amber)]">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>Washout consumes {Math.round(washoutPct)}% of the trial. Consider reducing the washout period or extending the trial duration.</span>
                                </div>
                            )}
                        </Card>
                    );
                })()}

                {/* Error */}
                {error && (
                    <div className="p-4 rounded-[var(--radius-card)] bg-[var(--color-coral)]/10 border border-[var(--color-coral)]/40 text-[var(--color-coral)] text-sm">
                        {error}
                    </div>
                )}

                {/* Submit */}
                <div className="flex gap-3">
                    <Button type="button" variant="secondary" onClick={() => router.back()} className="flex-1">
                        Cancel
                    </Button>
                    <Button type="submit" className="flex-1" isLoading={isSubmitting}>
                        Create Experiment
                    </Button>
                </div>
            </form>
        </div>
    );
}
