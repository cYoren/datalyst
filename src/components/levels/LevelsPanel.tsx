'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { mutate } from 'swr';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LevelCurve } from '@/components/levels/LevelCurve';
import { cn } from '@/lib/utils';
import {
    HALF_LIFE_PRESETS,
    clockLabel,
    clearTime,
    latestDoseTime,
    levelAt,
    minutesOfDay,
    presetForTracker,
    windowFor,
    type Dose,
} from '@/lib/levels';

/** The day opens at 04:00 so one late night stays one day. */
const DAY_OPEN_MINUTES = 4 * 60;

/** Numeric tracker that can hold a dose amount, e.g. mg of caffeine. */
export interface LevelTracker {
    habitId: string;
    habitName: string;
    subvariableId: string;
    subvariableName: string;
    unit?: string;
}

export interface LevelEntry {
    habitId: string;
    timestamp: string;
    subvariableEntries: Array<{ subvariableId: string; numericValue: number }>;
}

interface LevelsPanelProps {
    trackers: LevelTracker[];
    entries: LevelEntry[];
}

const SETTINGS_KEY = 'datalyst.levels.settings';

const SAMPLE_DOSES = [
    { minutes: 8 * 60, amount: 90 },
    { minutes: 11 * 60 + 15, amount: 95 },
    { minutes: 15 * 60 + 30, amount: 75 },
];

interface StoredSettings {
    trackerKey?: string;
    presetKey?: string;
    bedtimeMinutes?: number;
    floor?: number;
}

/** Minute of day to an offset inside the open day window, wrapping past midnight. */
function offsetOf(minutes: number) {
    return (minutes - DAY_OPEN_MINUTES + 1440) % 1440;
}

/** Nothing to subscribe to: the question is only whether we are in the browser yet. */
const subscribeToNothing = () => () => {};

/** Matches a media query without a state update in an effect. */
function useMediaQuery(query: string) {
    return useSyncExternalStore(
        (onChange) => {
            if (typeof window === 'undefined') return () => {};
            const media = window.matchMedia(query);
            media.addEventListener('change', onChange);
            return () => media.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false
    );
}

/** Quarter-hour bedtime options in 24 h, matching the clock on the chart. */
const BEDTIME_OPTIONS = Array.from({ length: 96 }, (_, index) => index * 15);

function readStoredSettings(): StoredSettings {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        return raw ? (JSON.parse(raw) as StoredSettings) : {};
    } catch {
        return {};
    }
}

export function LevelsPanel({ trackers, entries }: LevelsPanelProps) {
    const [now, setNow] = useState<number>(() => Date.now());
    const [override, setOverride] = useState<StoredSettings | null>(null);
    const [planned, setPlanned] = useState<Array<{ id: string; minutes: number; amount: number }>>([]);
    const [planAmount, setPlanAmount] = useState<number>(80);
    const [planMinutes, setPlanMinutes] = useState<number>(18 * 60);
    const [sample, setSample] = useState(false);
    const [logState, setLogState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [logNote, setLogNote] = useState('');

    const mounted = useSyncExternalStore(
        subscribeToNothing,
        () => true,
        () => false
    );

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const wide = useMediaQuery('(min-width: 640px)');

    const stored = useMemo(() => (mounted ? readStoredSettings() : {}), [mounted]);
    const settings = override ?? stored;

    const persist = useCallback(
        (patch: StoredSettings) => {
            const merged = { ...(override ?? readStoredSettings()), ...patch };
            setOverride(merged);
            try {
                window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
            } catch {
                // Private mode: these choices just do not survive a reload.
            }
        },
        [override]
    );

    const selectedTracker = useMemo(() => {
        if (trackers.length === 0) return null;
        return trackers.find((tracker) => trackerKey(tracker) === settings.trackerKey) ?? trackers[0];
    }, [settings.trackerKey, trackers]);

    const preset = useMemo(() => {
        const chosen = HALF_LIFE_PRESETS.find((item) => item.key === settings.presetKey);
        return chosen ?? presetForTracker(selectedTracker?.subvariableName ?? selectedTracker?.habitName);
    }, [selectedTracker, settings.presetKey]);

    const halfLifeHours = preset.hours;
    const unit = selectedTracker?.unit || 'mg';

    const bedtimeMinutes = settings.bedtimeMinutes ?? 23 * 60;
    const floor = settings.floor ?? 50;

    const dayWindow = useMemo(() => windowFor(new Date(now)), [now]);
    const absolute = useCallback(
        (minutes: number) => dayWindow.start + offsetOf(minutes) * 60_000,
        [dayWindow.start]
    );

    const bedtime = absolute(bedtimeMinutes);

    const loggedDoses = useMemo<Dose[]>(() => {
        if (sample) {
            return SAMPLE_DOSES.map((dose, index) => ({
                id: `sample-${index}`,
                at: absolute(dose.minutes),
                amount: dose.amount,
            }));
        }
        if (!selectedTracker) return [];

        // Carry the previous day into the sum: 24 h later a little is still in you.
        const from = dayWindow.start - 24 * 3_600_000;

        return entries
            .filter((entry) => entry.habitId === selectedTracker.habitId)
            .map((entry, index) => {
                const at = new Date(entry.timestamp).getTime();
                const value = entry.subvariableEntries.find(
                    (item) => item.subvariableId === selectedTracker.subvariableId
                );
                if (!value || !Number.isFinite(at) || value.numericValue <= 0) return null;
                if (at < from || at > dayWindow.end) return null;
                // Dot-free ids: recharts reads a dotted dataKey as a path.
                return { id: `e${index}`, at, amount: value.numericValue } as Dose;
            })
            .filter((dose): dose is Dose => dose !== null)
            .sort((a, b) => a.at - b.at);
    }, [absolute, entries, sample, selectedTracker, dayWindow.end, dayWindow.start]);

    const plannedDoses = useMemo<Dose[]>(
        () =>
            planned.map((dose) => ({
                id: dose.id,
                at: absolute(dose.minutes),
                amount: dose.amount,
                planned: true,
            })),
        [absolute, planned]
    );

    const doses = useMemo(() => [...loggedDoses, ...plannedDoses], [loggedDoses, plannedDoses]);

    // The readouts are exact: every dose peaks the moment it lands, so the peak is
    // the highest dose time, and the curve never rises between doses.
    const peakPoint = useMemo(() => {
        if (doses.length === 0) return null;
        let best: { t: number; value: number } | null = null;
        for (const dose of doses) {
            const value = levelAt(doses, dose.at, halfLifeHours);
            if (!best || value > best.value) best = { t: dose.at, value };
        }
        return best;
    }, [doses, halfLifeHours]);
    const bedtimeLevel = useMemo(
        () => levelAt(doses, bedtime, halfLifeHours),
        [bedtime, doses, halfLifeHours]
    );
    const clears = useMemo(
        () => clearTime({ doses, halfLifeHours, threshold: floor, from: now, until: dayWindow.end }),
        [doses, floor, halfLifeHours, now, dayWindow.end]
    );
    const lastDose = useMemo(
        () => latestDoseTime({ halfLifeHours, amount: planAmount, threshold: floor, bedtime }),
        [bedtime, floor, halfLifeHours, planAmount]
    );

    const nowClock = clockLabel(minutesOfDay(new Date(now)));
    const lastDoseToday = lastDose >= dayWindow.start && lastDose <= dayWindow.end;

    /**
     * One tap, one entry: a dose tracker appends instead of overwriting the day, so
     * the curve keeps every drink at the time it happened.
     */
    const logDose = async () => {
        if (!selectedTracker) return;
        setLogState('saving');
        const at = new Date();
        try {
            const res = await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    habitId: selectedTracker.habitId,
                    logicalDate: at.toISOString(),
                    timestamp: at.toISOString(),
                    subvariableEntries: [
                        { subvariableId: selectedTracker.subvariableId, numericValue: planAmount },
                    ],
                }),
            });
            if (!res.ok) {
                setLogState('error');
                return;
            }
            setLogNote('Logged ' + planAmount + ' ' + unit + ' at ' + clockLabel(minutesOfDay(at)) + '.');
            setLogState('saved');
            await mutate((key) => typeof key === 'string' && (key.startsWith('/api/data') || key.startsWith('/api/dashboard')));
        } catch {
            setLogState('error');
        }
    };

    const addPlan = () => {
        setPlanned((current) => [
            ...current,
            { id: `plan-${Date.now()}-${current.length}`, minutes: planMinutes, amount: planAmount },
        ]);
    };

    // `now` and the stored settings only exist in the browser; keep the server
    // render and the first client render identical.
    if (!mounted) {
        return <div className="h-[520px] rounded-[var(--radius-card)] bg-[var(--color-bg-card)]" aria-hidden />;
    }

    if (!selectedTracker) {
        return (
            <Card className="p-6 sm:p-8 shadow-[var(--shadow-card)]">
                <h2 className="text-lg font-semibold font-display text-[var(--text-primary)]">Levels</h2>
                <p className="mt-2 max-w-prose text-sm text-[var(--text-secondary)]">
                    Levels reads a number tracker that holds a dose, such as caffeine in mg, and shows how much
                    of each one is left when you go to bed. Every entry counts as one dose at the time you
                    logged it.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link href="/habits/new">
                        <Button>Create a tracker</Button>
                    </Link>
                    <Link
                        href="/habits/templates"
                        className="text-sm font-medium text-[var(--text-secondary)] underline-offset-4 hover:underline"
                    >
                        Start from a template
                    </Link>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-5 sm:p-8 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold font-display text-[var(--text-primary)]">Levels</h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        What is still in you at bedtime.
                    </p>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                    <label className="col-span-2 flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-bg-subtle)] px-3 py-2">
                        <span className="label-mono">Tracker</span>
                        <select
                            value={trackerKey(selectedTracker)}
                            onChange={(event) => persist({ trackerKey: event.target.value, presetKey: undefined })}
                            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none sm:max-w-[15rem]"
                            aria-label="Tracker to read doses from"
                        >
                            {trackers.map((tracker) => (
                                <option key={trackerKey(tracker)} value={trackerKey(tracker)}>
                                    {trackerLabel(tracker)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="col-span-2 flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-bg-subtle)] px-3 py-2">
                        <span className="label-mono">Half-life</span>
                        <select
                            value={preset.key}
                            onChange={(event) => persist({ presetKey: event.target.value })}
                            className="bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none"
                            aria-label="Substance half-life"
                        >
                            {HALF_LIFE_PRESETS.map((item) => (
                                <option key={item.key} value={item.key}>
                                    {item.label} {item.hours} h
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-bg-subtle)] px-3 py-2">
                        <span className="label-mono">Bed</span>
                        <select
                            value={bedtimeMinutes}
                            onChange={(event) => persist({ bedtimeMinutes: Number(event.target.value) })}
                            className="bg-transparent text-sm font-medium tabular-nums text-[var(--text-primary)] focus:outline-none"
                            aria-label="Bedtime"
                        >
                            {BEDTIME_OPTIONS.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                    {clockLabel(minutes)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-bg-subtle)] px-3 py-2">
                        <span className="label-mono">Floor</span>
                        <input
                            type="number"
                            min={0}
                            step={5}
                            value={floor}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                if (Number.isFinite(next) && next >= 0) persist({ floor: next });
                            }}
                            className="w-14 bg-transparent text-sm font-medium tabular-nums text-[var(--text-primary)] focus:outline-none"
                            aria-label={`Level considered clear, in ${unit}`}
                        />
                        <span className="text-xs text-[var(--text-tertiary)]">{unit}</span>
                    </label>
                </div>
            </div>

            <div className="mt-6 border-t border-[var(--color-border)] pt-5">
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    {[
                        `${doses.length} dose${doses.length === 1 ? '' : 's'}`,
                        `${Math.round(doses.reduce((total, dose) => total + dose.amount, 0))} ${unit}`,
                        `half-life ${halfLifeHours} h`,
                    ].join('  \u00b7  ')}
                </p>

                <LevelCurve
                    doses={doses}
                    halfLifeHours={halfLifeHours}
                    floor={floor}
                    unit={unit}
                    bedtimeMinutes={bedtimeMinutes}
                    start={dayWindow.start}
                    now={now}
                    height={wide ? 340 : 300}
                    lastDoseBy={lastDoseToday ? lastDose : null}
                    clearsBy={clears}
                    peak={peakPoint}
                    bedtimeLevel={bedtimeLevel}
                />
            </div>

            <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="label-mono">Amount</span>
                    <div className="flex flex-wrap gap-2">
                        {[80, 95, 150].map((amount) => (
                            <button
                                key={amount}
                                type="button"
                                onClick={() => setPlanAmount(amount)}
                                aria-pressed={planAmount === amount}
                                className={cn(
                                    'min-h-[36px] rounded-[var(--radius-button)] px-3 text-xs font-medium tabular-nums transition-colors',
                                    planAmount === amount
                                        ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                                        : 'bg-[var(--color-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                {amount} {unit}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div>
                        <Button
                            onClick={() => void logDose()}
                            disabled={logState === 'saving' || sample}
                            className="w-full sm:w-auto"
                        >
                            {logState === 'saving' ? 'Logging…' : `Log ${planAmount} ${unit} at ${nowClock}`}
                        </Button>
                        <p className="mt-2 min-h-[1.25rem] text-xs text-[var(--text-tertiary)]" role="status">
                            {logState === 'saved' && logNote}
                            {logState === 'error' && 'Could not save that dose. Try again, or log it in Check-in.'}
                            {logState === 'idle' && 'One tap adds a dose at the time you press it.'}
                        </p>
                    </div>

                    <div>
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="label-mono">Or plan it</span>
                            <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                                {clockLabel(planMinutes)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={1425}
                            step={15}
                            value={planMinutes}
                            onChange={(event) => setPlanMinutes(Number(event.target.value))}
                            aria-label="Time of the planned dose"
                            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-bg-subtle)] accent-[var(--color-accent)]"
                        />
                        <Button variant="secondary" onClick={addPlan} className="mt-3 w-full sm:w-auto">
                            Add to plan
                        </Button>
                    </div>
                </div>

                {planned.length > 0 && (
                    <ul className="mt-4 flex flex-wrap items-center gap-2">
                        {planned.map((dose) => (
                            <li
                                key={dose.id}
                                className="flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-accent-light)] px-3 py-1.5 text-xs font-medium tabular-nums text-[var(--text-primary)]"
                            >
                                {dose.amount} {unit} at {clockLabel(dose.minutes)}
                                <button
                                    type="button"
                                    onClick={() => setPlanned((current) => current.filter((item) => item.id !== dose.id))}
                                    aria-label={`Remove planned dose at ${clockLabel(dose.minutes)}`}
                                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </li>
                        ))}
                        <li>
                            <button
                                type="button"
                                onClick={() => setPlanned([])}
                                className="px-2 py-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                            >
                                Clear plan
                            </button>
                        </li>
                    </ul>
                )}

                <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    {sample ? (
                        <>
                            Showing a sample day of three doses.{' '}
                            <button
                                type="button"
                                onClick={() => setSample(false)}
                                className="font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
                            >
                                Back to your data
                            </button>
                        </>
                    ) : loggedDoses.length === 0 ? (
                        <>
                            No doses logged in this day yet. Log each one as its own entry and it lands here.{' '}
                            <button
                                type="button"
                                onClick={() => setSample(true)}
                                className="font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
                            >
                                Show a sample day
                            </button>
                        </>
                    ) : (
                        `${loggedDoses.length} dose${loggedDoses.length === 1 ? '' : 's'} logged in this day.`
                    )}
                </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-[var(--text-tertiary)]">
                One compartment, instant absorption, first-order elimination. Half-life varies between people
                ({preset.label.toLowerCase()} {preset.range}), so read the shape, not the number.
            </p>
        </Card>
    );
}

function trackerKey(tracker: LevelTracker) {
    return `${tracker.habitId}:${tracker.subvariableId}`;
}

function trackerLabel(tracker: LevelTracker) {
    return tracker.habitName === tracker.subvariableName
        ? tracker.habitName
        : `${tracker.habitName} · ${tracker.subvariableName}`;
}
