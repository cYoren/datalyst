'use client';

import React, { useState, useEffect } from 'react';
import { TrackerIcon, TRACKER_ICONS, DEFAULT_TRACKER_ICON } from '@/components/ui/TrackerIcon';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { TemplateSelector, type Template } from '@/components/habits/TemplateSelector';
import { SubvariableType } from '@/lib/subvariable-types';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import type { HabitSchedule, HabitSubvariable } from '@/types';

export interface HabitFormProps {
    initialData?: Partial<HabitFormData>;
    onSubmit: (data: HabitFormData) => Promise<void>;
    isSubmitting?: boolean;
}

export interface HabitFormData {
    name: string;
    description: string;
    color: string;
    icon: string;
    scheduleType: ScheduleType;
    scheduleDays: number[];
    timeBlock: TimeBlock;
    schedule: HabitSchedule;
    subvariables: HabitSubvariable[];
    templateId?: string;
}

type ScheduleType = 'DAILY' | 'WEEKLY' | 'ADHOC';
type TimeBlock = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME';
type GoalDirection = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'NEUTRAL';

export const HabitForm = ({ initialData, onSubmit, isSubmitting }: HabitFormProps) => {
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [color, setColor] = useState(initialData?.color || '#3b82f6');
    const [icon, setIcon] = useState(initialData?.icon || DEFAULT_TRACKER_ICON);

    // Schedule State (new Protocol Rules)
    const [scheduleType, setScheduleType] = useState<ScheduleType>(initialData?.scheduleType || 'DAILY');
    const [scheduleDays, setScheduleDays] = useState<number[]>(initialData?.scheduleDays || []);
    const [timeBlock, setTimeBlock] = useState<TimeBlock>(initialData?.timeBlock || 'ANYTIME');

    // Legacy schedule parsing (for backward compatibility)
    let parsedSchedule: HabitSchedule = {};
    try {
        parsedSchedule = initialData?.schedule ?
            (typeof initialData.schedule === 'string' ? JSON.parse(initialData.schedule) : initialData.schedule)
            : {};
    } catch (e) {
        console.error('Failed to parse initial schedule', e);
    }
    const initialSchedule = parsedSchedule;
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'custom'>(initialSchedule.frequency || 'daily');
    const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initialSchedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]);
    const [logLimit, setLogLimit] = useState<'unlimited' | 'daily'>(initialSchedule.logLimit || 'unlimited');

    const [subvariables, setSubvariables] = useState<HabitSubvariable[]>(initialData?.subvariables || []);

    // Auto-populate from template
    useEffect(() => {
        if (selectedTemplate) {
            // Only update if not in edit mode (no initialData)
            if (!initialData) {
                setName(selectedTemplate.name);
                if (selectedTemplate.description) setDescription(selectedTemplate.description);
                setColor(selectedTemplate.color);
                setIcon(selectedTemplate.icon);

                if (selectedTemplate.defaultSchedule) {
                    if (selectedTemplate.defaultSchedule.frequency) {
                        setFrequency(selectedTemplate.defaultSchedule.frequency);
                    }
                    if (selectedTemplate.defaultSchedule.daysOfWeek) {
                        setDaysOfWeek(selectedTemplate.defaultSchedule.daysOfWeek);
                    }
                    if (selectedTemplate.defaultSchedule.logLimit) {
                        setLogLimit(selectedTemplate.defaultSchedule.logLimit);
                    }
                }

                if (selectedTemplate.subvariableTemplate && selectedTemplate.subvariableTemplate.length > 0) {
                    setSubvariables(selectedTemplate.subvariableTemplate);
                }
            }
        }
    }, [selectedTemplate, initialData]);

    const addSubvariable = (type: SubvariableType) => {
        let metadata = {};
        if (type === SubvariableType.SCALE_0_10) {
            metadata = { labels: ['Low', 'High'] };
        } else if (type === SubvariableType.CATEGORY) {
            metadata = { options: ['Option 1', 'Option 2'] };
        }

        setSubvariables([
            ...subvariables,
            {
                name: '',
                type,
                unit: '',
                prompt: '',
                goalDirection: 'NEUTRAL' as GoalDirection,
                metadata,
                order: subvariables.length
            }
        ]);
    };

    const removeSubvariable = (index: number) => {
        setSubvariables(subvariables.filter((_, i) => i !== index));
    };

    const updateSubvariable = (index: number, field: string, value: unknown) => {
        const newSubs = [...subvariables];
        newSubs[index] = { ...newSubs[index], [field]: value };
        setSubvariables(newSubs);
    };

    const updateSubvariableMetadata = (index: number, key: string, value: unknown) => {
        const newSubs = [...subvariables];
        newSubs[index] = {
            ...newSubs[index],
            metadata: { ...newSubs[index].metadata, [key]: value }
        };
        setSubvariables(newSubs);
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Legacy schedule object (for backward compatibility)
        const schedule = {
            frequency,
            daysOfWeek: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : daysOfWeek,
            logLimit
        };

        const body: HabitFormData = {
            name,
            description,
            color,
            icon,
            // New Protocol Rules fields
            scheduleType,
            scheduleDays: scheduleType === 'WEEKLY' ? scheduleDays : [],
            timeBlock,
            // Legacy (backward compat)
            schedule,
            subvariables: subvariables.map((s) => ({
                id: s.id, // Include ID if editing
                name: s.name,
                type: s.type,
                unit: s.unit,
                prompt: s.prompt || null,
                goalDirection: s.goalDirection || 'NEUTRAL',
                metadata: s.metadata ? (typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata) : {},
                order: s.order
            }))
        };

        // Include templateId only if creating (not editing) and template is selected
        if (!initialData && selectedTemplate) {
            body.templateId = selectedTemplate.id;
        }

        onSubmit(body);
    };

    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e', '#64748b'];
    const icons = Object.keys(TRACKER_ICONS);
    const weekDays = [
        { label: 'S', value: 0 },
        { label: 'M', value: 1 },
        { label: 'T', value: 2 },
        { label: 'W', value: 3 },
        { label: 'T', value: 4 },
        { label: 'F', value: 5 },
        { label: 'S', value: 6 },
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Template Selector - Only show when creating new habit */}
            {!initialData && (
                <section className="space-y-4">
                    <TemplateSelector
                        onSelect={setSelectedTemplate}
                        selectedTemplate={selectedTemplate}
                    />
                </section>
            )}

            {/* Basic Info */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Basic Information</h3>

                <Input
                    label="Tracker Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Sleep Optimization, Focus Tracker"
                    required
                />

                <Input
                    label="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Strength training 3x/week"
                />

                <div className="space-y-2">
                    <label className="label-mono">Schedule Type</label>
                    <div className="flex gap-2 flex-wrap">
                        {([
                            { value: 'DAILY', label: 'Every Day' },
                            { value: 'WEEKLY', label: 'Specific Days' },
                            { value: 'ADHOC', label: 'Ad-hoc' }
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setScheduleType(opt.value)}
                                className={cn(
                                    "px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-all border",
                                    scheduleType === opt.value
                                        ? "bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
                                        : "bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)]"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {scheduleType === 'ADHOC' && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Ad-hoc trackers don&apos;t appear in Daily Check-in automatically
                        </p>
                    )}

                    {scheduleType === 'WEEKLY' && (
                        <div className="flex gap-2 mt-2">
                            {weekDays.map((day) => (
                                <button
                                    key={day.value}
                                    type="button"
                                    onClick={() => {
                                        if (scheduleDays.includes(day.value)) {
                                            setScheduleDays(scheduleDays.filter(d => d !== day.value));
                                        } else {
                                            setScheduleDays([...scheduleDays, day.value]);
                                        }
                                    }}
                                    className={cn(
                                        "h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all border",
                                        scheduleDays.includes(day.value)
                                            ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-on-accent)]"
                                            : "bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)]"
                                    )}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="label-mono">Time Block</label>
                    <div className="flex gap-2 flex-wrap">
                        {([
                            { value: 'MORNING', label: 'Morning' },
                            { value: 'AFTERNOON', label: 'Afternoon' },
                            { value: 'EVENING', label: 'Evening' },
                            { value: 'ANYTIME', label: '⏰ Anytime' }
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTimeBlock(opt.value)}
                                className={cn(
                                    "px-3 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-all border",
                                    timeBlock === opt.value
                                        ? "bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
                                        : "bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)]"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>


                <div className="space-y-2">
                    <label className="label-mono">Log Limit</label>
                    <div className="flex gap-2">
                        {(['unlimited', 'daily'] as const).map((limit) => (
                            <button
                                key={limit}
                                type="button"
                                onClick={() => setLogLimit(limit)}
                                className={cn(
                                    "px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-all border",
                                    logLimit === limit
                                        ? "bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
                                        : "bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)]"
                                )}
                            >
                                {limit === 'unlimited' ? 'Unlimited' : 'Once daily'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="label-mono">Color</label>
                    <div className="flex flex-wrap gap-2">
                        {colors.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={cn(
                                    "h-8 w-8 rounded-full transition-all",
                                    color === c ? "ring-2 ring-offset-2 ring-[var(--text-primary)] scale-110" : "hover:scale-105"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="label-mono">Icon</label>
                    <div className="flex flex-wrap gap-2">
                        {icons.map(i => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setIcon(i)}
                                className={cn(
                                    "h-10 w-10 rounded-[var(--radius-card)] flex items-center justify-center text-xl transition-all border",
                                    icon === i
                                        ? "bg-[var(--color-accent-light)] border-[var(--color-accent)]"
                                        : "bg-[var(--color-control-bg)] border-[var(--color-control-border)] hover:bg-[var(--color-control-bg-hover)]"
                                )}
                                aria-label={i}
                                aria-pressed={icon === i}
                            >
                                <TrackerIcon value={i} className="h-5 w-5" />
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Subvariables */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-1">
                        Metrics to track
                        <InfoTooltip text="Numeric: any number (weight, duration, reps). Scale 0-10: a rating slider. Yes/No: a simple toggle. Category: pick from a list of options." />
                    </h3>
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                    Track both what you do (<strong>inputs</strong>) and how you feel (<strong>outputs</strong>). Example: &apos;Duration&apos; (input) + &apos;Satisfaction&apos; (output). This lets us find correlations between your actions and results.
                </p>

                <div className="space-y-3">
                    {subvariables.map((sub, index) => (
                        <Card key={index} className="p-4 flex gap-4 items-start relative group">
                            <div className="mt-3 text-[var(--text-tertiary)]">
                                <GripVertical className="h-5 w-5" suppressHydrationWarning />
                            </div>

                            <div className="flex-1 space-y-3">
                                <div className="flex gap-3">
                                    <Input
                                        placeholder="Metric name"
                                        value={sub.name}
                                        onChange={(e) => updateSubvariable(index, 'name', e.target.value)}
                                        className="flex-1"
                                        required
                                    />
                                    <div className="w-32">
                                        <select
                                            value={sub.type}
                                            onChange={(e) => updateSubvariable(index, 'type', e.target.value)}
                                            className="h-10 w-full rounded-[var(--radius-card)] border border-[var(--color-control-border)] px-3 text-sm bg-[var(--color-control-bg)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none"
                                        >
                                            <option value="NUMERIC">Numeric</option>
                                            <option value="SCALE_0_10">Scale 0-10</option>
                                            <option value="BOOLEAN">Yes/No</option>
                                            <option value="CATEGORY">Category</option>
                                        </select>
                                    </div>
                                </div>

                                {sub.type === 'NUMERIC' && (
                                    <Input
                                        placeholder="Unit (e.g., kg, min)"
                                        value={sub.unit || ''}
                                        onChange={(e) => updateSubvariable(index, 'unit', e.target.value)}
                                    />
                                )}

                                {sub.type === 'CATEGORY' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-[var(--text-secondary)]">Options (comma separated)</label>
                                        <Input
                                            placeholder="Ex: Happy, Sad, Anxious"
                                            value={sub.metadata?.options?.join(', ') || ''}
                                            onChange={(e) => updateSubvariableMetadata(index, 'options', e.target.value.split(',').map((s: string) => s.trim()))}
                                        />
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => removeSubvariable(index)}
                                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--color-error)] transition-colors"
                            >
                                <Trash2 className="h-5 w-5" suppressHydrationWarning />
                            </button>
                        </Card>
                    ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                    <Button type="button" variant="secondary" size="sm" onClick={() => addSubvariable(SubvariableType.NUMERIC)}>
                        <Plus className="h-4 w-4 mr-1" suppressHydrationWarning /> Numeric
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => addSubvariable(SubvariableType.SCALE_0_10)}>
                        <Plus className="h-4 w-4 mr-1" suppressHydrationWarning /> Scale 0-10
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => addSubvariable(SubvariableType.BOOLEAN)}>
                        <Plus className="h-4 w-4 mr-1" suppressHydrationWarning /> Yes/No
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => addSubvariable(SubvariableType.CATEGORY)}>
                        <Plus className="h-4 w-4 mr-1" suppressHydrationWarning /> Category
                    </Button>
                </div>

                {subvariables.length === 1 && (
                    <p className="text-xs text-[var(--color-amber)] bg-[var(--color-amber)]/10 p-2 rounded-[var(--radius-card)]">
                        Tip: trackers with 2+ metrics can reveal correlations. Add an output metric (like &quot;Mood&quot; or &quot;Energy&quot;) to see how your inputs affect outcomes.
                    </p>
                )}
            </section>

            <div className="pt-6 border-t border-[var(--color-border)]">
                <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
                    Save Tracker
                </Button>
            </div>
        </form>
    );
};
