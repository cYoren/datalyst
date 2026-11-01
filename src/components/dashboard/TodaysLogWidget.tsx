'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { useTodaysLog, TodayVariable } from '@/lib/useTodaysLog';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, FlaskConical, ChevronDown, ChevronUp, MoreHorizontal, Sunrise, Sun, Moon, Clock } from 'lucide-react';
import { triggerSelectionHaptic, triggerSuccessHaptic } from '@/lib/haptics';
import { formatLocalDateKey } from '@/lib/dateUtils';
import { syncReminder } from '@/lib/reminders';

// Intervention Banner Component for active experiments
const InterventionBanner = ({ assignment }: { assignment: TodayVariable['activeAssignment'] }) => {
    if (!assignment) return null;

    const isWashout = assignment.isWashout;
    const isIntervention = assignment.condition === 'A'; // Typically A = intervention

    const label = isWashout
        ? 'Washout day, no intervention'
        : isIntervention
            ? `${assignment.conditionLabel || 'Intervention'} today`
            : `${assignment.conditionLabel || 'Control'} today, skip the intervention`;

    const bgColor = isWashout
        ? 'bg-[var(--color-amber)]/10 border-[var(--color-amber)]/30'
        : isIntervention
            ? 'bg-[var(--color-teal)]/10 border-[var(--color-teal)]/30'
            : 'bg-[var(--color-coral)]/10 border-[var(--color-coral)]/30';

    const textColor = isWashout
        ? 'text-[var(--color-amber)]'
        : isIntervention
            ? 'text-[var(--color-teal)]'
            : 'text-[var(--color-coral)]';

    return (
        <div className={cn(
            "mb-3 px-3 py-2 rounded-[var(--radius-card)] border-2 flex items-center gap-2",
            bgColor
        )}>
            <FlaskConical className={cn("h-4 w-4", textColor)} />
            <span className={cn("text-xs font-bold", textColor)}>
                {label}
            </span>
        </div>
    );
};

// Compliance Toggle Component
const ComplianceToggle = ({
    checked,
    onChange,
    disabled
}: {
    checked: boolean | null;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) => {
    return (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <label className="flex items-center gap-2 cursor-pointer">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        void triggerSelectionHaptic();
                        onChange(!checked);
                    }}
                    className={cn(
                        "w-11 h-11 rounded border-2 flex items-center justify-center transition-all",
                        checked
                            ? "bg-[var(--color-teal)] border-[var(--color-teal)] text-[var(--color-on-accent)]"
                            : "bg-[var(--color-bg-subtle)] border-[var(--color-border)] hover:border-[var(--color-teal)]"
                    )}
                >
                    {checked && <Check className="h-3 w-3" />}
                </button>
                <span className="text-xs text-[var(--text-secondary)]">
                    I followed today&apos;s assignment
                </span>
            </label>
        </div>
    );
};

// Inline variable item component
interface VariableItemProps {
    variable: TodayVariable;
    onLog: (
        habitId: string,
        subvariableId: string,
        value: number,
        options?: {
            rawValue?: string;
            followedAssignment?: boolean;
            logicalDate?: string;
            note?: string;
        }
    ) => Promise<boolean>;
    isLogging: boolean;
    isOptimisticLogged?: boolean;
}

const VariableItem = React.memo(function VariableItem({
    variable,
    onLog,
    isLogging,
    isOptimisticLogged = false
}: VariableItemProps) {
    const todayDate = formatLocalDateKey(new Date());
    // No default value: a pre-filled 5 or 0 gets saved by people who did not
    // mean it, and that is noise in someone's research data.
    const savedValue = variable.todayEntry?.numericValue ?? null;
    const [localValue, setLocalValue] = useState<number | null>(savedValue);
    const [numericText, setNumericText] = useState(savedValue === null ? '' : String(savedValue));
    const [followedProtocol, setFollowedProtocol] = useState<boolean | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [entryDate, setEntryDate] = useState(todayDate);
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const isLogged = !!variable.todayEntry || isOptimisticLogged;
    const hasActiveExperiment = !!variable.activeAssignment;
    const isBackdating = entryDate !== todayDate;
    const categoryOptions = React.useMemo(() => variable.metadata?.options ?? [], [variable.metadata?.options]);

    // Follow the server value when it changes (revalidation, another device).
    const [syncedValue, setSyncedValue] = useState(savedValue);
    if (syncedValue !== savedValue) {
        setSyncedValue(savedValue);
        setLocalValue(savedValue);
        setNumericText(savedValue === null ? '' : String(savedValue));
    }

    const rawValueFor = useCallback((value: number) => (
        variable.type === 'BOOLEAN' ? (value === 1 ? 'Yes' : 'No')
            : variable.type === 'CATEGORY' ? categoryOptions[value]
                : undefined
    ), [variable.type, categoryOptions]);

    // Taps save straight away. Date and note from the advanced panel ride
    // along with whatever is saved next.
    const save = useCallback(async (value: number) => {
        void triggerSelectionHaptic();
        setLocalValue(value);
        setError(null);
        const success = await onLog(variable.habitId, variable.id, value, {
            rawValue: rawValueFor(value),
            followedAssignment: hasActiveExperiment ? followedProtocol ?? undefined : undefined,
            logicalDate: entryDate,
            note: note.trim() || undefined,
        });
        if (success) {
            void triggerSuccessHaptic();
            if (isBackdating || note.trim()) {
                setNote('');
                setEntryDate(todayDate);
                setShowAdvanced(false);
            }
        } else {
            setError('Could not save. Tap again to retry.');
        }
    }, [onLog, variable.habitId, variable.id, rawValueFor, hasActiveExperiment, followedProtocol, entryDate, note, isBackdating, todayDate]);

    const parsedNumeric = numericText.trim() === '' ? NaN : Number(numericText.replace(',', '.'));
    const numericValid = Number.isFinite(parsedNumeric);

    const chip = (selected: boolean) => cn(
        "min-h-[44px] min-w-0 rounded-[var(--radius-button)] text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-60",
        selected
            ? "bg-[var(--color-success)] text-[var(--color-on-accent)]"
            : "bg-[var(--color-control-bg-hover)] text-[var(--text-primary)] hover:bg-[#2e3037]"
    );

    return (
        <div
            className={cn(
                "rounded-[var(--radius-card)] p-3 transition-colors duration-300",
                hasActiveExperiment
                    ? "bg-[var(--color-accent-light)]"
                    : isLogged
                        ? "bg-[var(--color-success)]/10"
                        : "bg-[var(--color-bg-subtle)]"
            )}
        >
            {hasActiveExperiment && <InterventionBanner assignment={variable.activeAssignment} />}

            <div className="mb-2 flex items-center gap-2">
                <TrackerIcon value={variable.habitIcon} className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
                <div className="min-w-0 flex-1">
                    <span className={cn(
                        "block break-words text-sm font-medium",
                        isLogged ? "text-[var(--color-success)]" : "text-[var(--text-primary)]"
                    )}>
                        {variable.name}
                        {variable.unit && <span className="ml-1 font-normal text-[var(--text-tertiary)]">({variable.unit})</span>}
                    </span>
                    {variable.habitName !== variable.name && (
                        <span className="block break-words text-xs text-[var(--text-tertiary)]">{variable.habitName}</span>
                    )}
                </div>
                {isLogging ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--color-accent)]" aria-label="Saving" />
                ) : isLogged ? (
                    <Check className="h-5 w-5 shrink-0 text-[var(--color-success)]" aria-label="Checked in" />
                ) : null}
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    aria-expanded={showAdvanced}
                    aria-label="Advanced actions: date and note"
                    className={cn(
                        "-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        (showAdvanced || isBackdating || note) && "text-[var(--color-accent)]"
                    )}
                >
                    <MoreHorizontal className="h-5 w-5" />
                </button>
            </div>

            {showAdvanced && (
                <div className="mb-3 space-y-3 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-[var(--text-secondary)]">
                            <span className="mb-1 block font-medium">Date</span>
                            <input
                                type="date"
                                value={entryDate}
                                onChange={(e) => setEntryDate(e.target.value || todayDate)}
                                max={todayDate}
                                className="h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-bg-subtle)] px-2.5 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                            />
                        </label>
                        <label className="text-xs text-[var(--text-secondary)]">
                            <span className="mb-1 block font-medium">Note (optional)</span>
                            <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Add context"
                                className="h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-bg-subtle)] px-2.5 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                            />
                        </label>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                        {isBackdating ? `The next value you pick saves to ${entryDate}.` : 'The next value you pick saves with this note.'}
                        {localValue !== null && (
                            <button
                                type="button"
                                onClick={() => void save(localValue)}
                                disabled={isLogging}
                                className="ml-2 font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline"
                            >
                                Save current value
                            </button>
                        )}
                    </p>
                </div>
            )}

            {variable.type === 'BOOLEAN' && (
                <div className="grid grid-cols-2 gap-2">
                    {[1, 0].map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => void save(value)}
                            disabled={isLogging}
                            aria-pressed={isLogged && localValue === value}
                            aria-label={`Set ${variable.name} to ${value ? 'yes' : 'no'}`}
                            className={chip(isLogged && localValue === value)}
                        >
                            {value ? 'Yes' : 'No'}
                        </button>
                    ))}
                </div>
            )}

            {variable.type === 'SCALE_0_10' && (
                <div>
                    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="group" aria-label={`${variable.name}, 0 to 10`}>
                        {Array.from({ length: 11 }, (_, value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => void save(value)}
                                disabled={isLogging}
                                aria-pressed={isLogged && localValue === value}
                                aria-label={`Set ${variable.name} to ${value}`}
                                className={cn(chip(isLogged && localValue === value), "tabular-nums")}
                            >
                                {value}
                            </button>
                        ))}
                    </div>
                    {variable.metadata?.labels && variable.metadata.labels.length >= 2 && (
                        <div className="mt-1 flex justify-between text-[11px] text-[var(--text-tertiary)]">
                            <span>0 · {variable.metadata.labels[0]}</span>
                            <span>{variable.metadata.labels[variable.metadata.labels.length - 1]} · 10</span>
                        </div>
                    )}
                </div>
            )}

            {variable.type === 'NUMERIC' && (
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (numericValid) void save(parsedNumeric);
                    }}
                >
                    <input
                        type="text"
                        inputMode="decimal"
                        value={numericText}
                        onChange={(e) => setNumericText(e.target.value)}
                        aria-label={`${variable.name} value`}
                        className="min-h-[44px] w-0 min-w-0 flex-1 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-bg-card)] px-3 py-2 text-center text-base font-medium focus:border-[var(--color-accent)] focus:outline-none"
                        placeholder={variable.unit ?? 'Value'}
                    />
                    <button
                        type="submit"
                        disabled={isLogging || !numericValid || (isLogged && parsedNumeric === savedValue && !isBackdating && !note.trim())}
                        className="min-h-[44px] shrink-0 rounded-[var(--radius-card)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
                    >
                        {isLogged ? 'Update' : 'Save'}
                    </button>
                </form>
            )}

            {variable.type === 'CATEGORY' && (
                <div className="flex flex-wrap gap-2">
                    {categoryOptions.map((option, index) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => void save(index)}
                            disabled={isLogging}
                            aria-pressed={isLogged && localValue === index}
                            aria-label={`Set ${variable.name} to ${option}`}
                            className={cn(chip(isLogged && localValue === index), "px-4")}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}

            {hasActiveExperiment && !isLogged && (
                <ComplianceToggle
                    checked={followedProtocol}
                    onChange={setFollowedProtocol}
                    disabled={isLogging}
                />
            )}

            {error && (
                <p className="mt-2 text-xs text-[var(--color-error)]" role="status" aria-live="polite">{error}</p>
            )}
        </div>
    );
}, (prev, next) => (
    prev.variable === next.variable &&
    prev.isLogging === next.isLogging &&
    prev.isOptimisticLogged === next.isOptimisticLogged
));

// Main Widget Component
export const TodaysLogWidget = () => {
    const { summary, isLoading, logVariable, lastError, pendingSync } = useTodaysLog();
    const todayDate = formatLocalDateKey(new Date());
    const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
    const [optimisticLoggedIds, setOptimisticLoggedIds] = useState<Set<string>>(new Set());
    // A finished day folds down to one line so the dashboard leads with results
    // instead of a wall of already-logged cards. A tap on the header overrides.
    const [collapseOverride, setCollapseOverride] = useState<boolean | null>(null);
    const allDone = summary.total > 0 && summary.logged >= summary.total;
    const isCollapsed = collapseOverride ?? allDone;

    useEffect(() => {
        if (!isLoading) void syncReminder(allDone);
    }, [isLoading, allDone]);
    const handleLog = useCallback(async (
        habitId: string,
        subvariableId: string,
        numericValue: number,
        options?: {
            rawValue?: string;
            followedAssignment?: boolean;
            logicalDate?: string;
            note?: string;
        }
    ): Promise<boolean> => {
        const targetDate = options?.logicalDate || todayDate;
        const isTodayLog = targetDate === todayDate;
        let didApplyOptimistic = false;

        setLoggingIds(prev => new Set(prev).add(subvariableId));
        if (isTodayLog) {
            setOptimisticLoggedIds(prev => new Set(prev).add(subvariableId));
            didApplyOptimistic = true;
        }

        const success = await logVariable(habitId, subvariableId, numericValue, options);
        if (!success && didApplyOptimistic) {
            setOptimisticLoggedIds(prev => {
                const next = new Set(prev);
                next.delete(subvariableId);
                return next;
            });
        }

        setLoggingIds(prev => {
            const next = new Set(prev);
            next.delete(subvariableId);
            return next;
        });

        return success;
    }, [logVariable, todayDate]);

    // Group variables by time block - MUST be before any conditional return
    // Filter out independent variables (managed by ProtocolCommandCenter)
    const groupedVariables = React.useMemo(() => {
        const groups: Record<string, TodayVariable[]> = {
            'MORNING': [],
            'AFTERNOON': [],
            'EVENING': [],
            'ANYTIME': []
        };

        // Filter out variables that are the independent variable in an active experiment
        // Those are managed by ProtocolCommandCenter, not this widget
        const filteredVariables = summary.variables.filter(v => !v.isExperimentIndependent);

        filteredVariables.forEach(variable => {
            const block = variable.timeBlock || 'ANYTIME';
            if (!groups[block]) groups[block] = [];
            groups[block].push(variable);
        });

        return groups;
    }, [summary.variables]);

    // Check if any variable has an active experiment
    const hasActiveExperiment = summary.variables.some(v => !!v.activeAssignment);

    const getBlockLabel = (block: string) => {
        switch (block) {
            case 'MORNING': return 'Morning';
            case 'AFTERNOON': return 'Afternoon';
            case 'EVENING': return 'Evening';
            case 'ANYTIME': return 'Anytime';
            default: return 'Anytime';
        }
    };

    const getBlockIcon = (block: string) => {
        switch (block) {
            case 'MORNING': return <Sunrise className="h-4 w-4" aria-hidden />;
            case 'AFTERNOON': return <Sun className="h-4 w-4" aria-hidden />;
            case 'EVENING': return <Moon className="h-4 w-4" aria-hidden />;
            default: return <Clock className="h-4 w-4" aria-hidden />;
        }
    };

    // Don't render if no variables - AFTER all hooks are called
    if (!isLoading && summary.variables.length === 0) {
        return null;
    }

    // Simplified positioning - always sticky
    return (
        <Card
            className={cn(
                "z-20 p-0 overflow-hidden bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] transition-all duration-300 paper-lift",
                "rounded-[var(--radius-card)]",
                hasActiveExperiment && "ring-1 ring-[var(--color-accent)]/20 shadow-[var(--shadow-elevated)]"
            )}
        >
            {/* Header */}
            <div
                className="min-h-[72px] p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--color-bg-subtle)]/50 transition-colors"
                onClick={() => {
                    void triggerSelectionHaptic();
                    setCollapseOverride(!isCollapsed);
                }}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-[var(--radius-button)]",
                        hasActiveExperiment
                            ? "bg-[var(--color-violet)]/15 text-[var(--color-violet)]"
                            : "bg-[var(--color-bg-subtle)] text-[var(--color-accent)]"
                    )}>
                        <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-bold font-display text-lg text-[var(--text-primary)] tracking-tight">
                            Daily Check-in
                        </h2>
                        <p className="text-sm text-[var(--text-secondary)]">
                            {isLoading ? 'Loading...' : allDone ? 'All done for today' : `${summary.logged}/${summary.total} checked in`}
                            {hasActiveExperiment && (
                                <span className="ml-2 text-xs text-[var(--color-accent)] font-medium">
                                    • Experiment Active
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isLoading && allDone && <Check className="h-5 w-5 text-[var(--color-success)]" aria-label="All done" />}

                    {isCollapsed ? (
                        <ChevronDown className="h-5 w-5 text-[var(--text-tertiary)]" />
                    ) : (
                        <ChevronUp className="h-5 w-5 text-[var(--text-tertiary)]" />
                    )}
                </div>
            </div>

            {/* Variables List */}
            {!isCollapsed && (
                <div className="px-4 pb-4">
                    {pendingSync > 0 && (
                        <p className="mb-3 rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
                            You are offline. {pendingSync} check-in{pendingSync === 1 ? '' : 's'} saved on this phone and will sync when you reconnect.
                        </p>
                    )}
                    {lastError && (
                        <p className="mb-3 rounded-[var(--radius-card)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]" role="status" aria-live="polite">
                            {lastError}
                        </p>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                        </div>
                    ) : (
                        <div data-testid="daily-checkin-list" className="flex flex-col gap-4 pr-1 max-h-none overflow-visible sm:max-h-[60vh] sm:overflow-y-auto">
                            {Object.entries(groupedVariables).map(([block, variables]) => {
                                if (variables.length === 0) return null;
                                return (
                                    <div key={block} className="space-y-3">
                                        <h3 className="label-mono flex items-center gap-2 pl-1">
                                            <span>{getBlockIcon(block)}</span>
                                            <span>{getBlockLabel(block)}</span>
                                        </h3>
                                        <div className="grid gap-3">
                                            {variables.map((variable) => (
                                                <VariableItem
                                                    key={variable.id}
                                                    variable={variable}
                                                    onLog={handleLog}
                                                    isLogging={loggingIds.has(variable.id)}
                                                    isOptimisticLogged={optimisticLoggedIds.has(variable.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {allDone && isCollapsed && (
                <Link
                    href="/data"
                    className="flex min-h-[44px] items-center justify-between border-t border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-subtle)]"
                >
                    See how today compares
                    <ArrowRight className="h-4 w-4" />
                </Link>
            )}
        </Card>
    );
};

export default TodaysLogWidget;
