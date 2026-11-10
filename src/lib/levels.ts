/**
 * Substance levels: how much of a logged dose is still in you at a given time.
 *
 * One-compartment model, instant absorption, first-order elimination. That is the
 * same shape the "caffeine for optimal sleep" planners show, and it is enough to
 * answer the two questions worth answering: what is left at bedtime, and what is
 * the latest dose that still clears before it.
 *
 * Half-life is a property of the substance, not of the dose, and varies a lot
 * between people (caffeine 3 to 7 h). The UI carries the range so nobody reads a
 * single number as their own metabolism.
 */

export interface Dose {
    id: string;
    /** Epoch milliseconds. */
    at: number;
    /** Amount in the tracker's unit, e.g. mg of caffeine. */
    amount: number;
    /** True when the user is planning rather than reporting. */
    planned?: boolean;
}

export interface SeriesPoint {
    /** Epoch milliseconds. */
    t: number;
    /** Level from logged doses only. */
    logged: number;
    /** Level from planned doses only. */
    planned: number;
    /** logged + planned. */
    total: number;
    /** Per-dose contribution, keyed by dose id, for the stacked areas. */
    doses: Record<string, number>;
}

export interface HalfLifePreset {
    key: string;
    label: string;
    hours: number;
    /** Typical range in adults, shown next to the control. */
    range: string;
    /** Matches a tracker name so the right substance is preselected. */
    match: RegExp;
}

export const HALF_LIFE_PRESETS: HalfLifePreset[] = [
    { key: 'caffeine', label: 'Caffeine', hours: 5, range: '3 to 7 h', match: /caffeine|coffee|espresso|matcha|tea\b|cola/i },
    { key: 'nicotine', label: 'Nicotine', hours: 2, range: '1 to 4 h', match: /nicotine|vape|smok|cigarette/i },
    { key: 'melatonin', label: 'Melatonin', hours: 1.5, range: '0.7 to 2 h', match: /melatonin/i },
    { key: 'ibuprofen', label: 'Ibuprofen', hours: 2, range: '1.8 to 2.5 h', match: /ibuprofen|nurofen|advil/i },
    { key: 'paracetamol', label: 'Paracetamol', hours: 2.5, range: '2 to 3 h', match: /paracetamol|acetaminophen|tylenol/i },
    { key: 'alcohol', label: 'Alcohol', hours: 1, range: 'linear, 0.15 g/L per h', match: /alcohol|beer|wine|drink/i },
];

/** Amount still present `deltaMs` after the dose. Zero before the dose. */
export function decayFactor(deltaMs: number, halfLifeHours: number): number {
    if (deltaMs < 0 || halfLifeHours <= 0) return 0;
    const halfLives = deltaMs / 3_600_000 / halfLifeHours;
    return Math.pow(2, -halfLives);
}

/** Total level at `at`, summing every dose taken before it. */
export function levelAt(doses: Dose[], at: number, halfLifeHours: number): number {
    let level = 0;
    for (const dose of doses) {
        level += dose.amount * decayFactor(at - dose.at, halfLifeHours);
    }
    return level;
}

/**
 * Sampled levels across a window, with the per-dose split so the chart can stack
 * each dose. Planned doses are kept in their own column but still count in `total`.
 */
export function buildSeries(options: {
    doses: Dose[];
    halfLifeHours: number;
    start: number;
    end: number;
    stepMinutes?: number;
}): SeriesPoint[] {
    const { doses, halfLifeHours, start, end, stepMinutes = 5 } = options;
    const stepMs = Math.max(1, stepMinutes) * 60_000;
    const points: SeriesPoint[] = [];

    for (let t = start; t <= end; t += stepMs) {
        const contributions: Record<string, number> = {};
        let logged = 0;
        let planned = 0;

        for (const dose of doses) {
            const value = dose.amount * decayFactor(t - dose.at, halfLifeHours);
            contributions[dose.id] = value;
            if (dose.planned) planned += value;
            else logged += value;
        }

        points.push({ t, logged, planned, total: logged + planned, doses: contributions });
    }

    return points;
}

/** Highest level in the window and when it happens. */
export function peak(series: SeriesPoint[]): { t: number; value: number } | null {
    let best: { t: number; value: number } | null = null;
    for (const point of series) {
        if (!best || point.total > best.value) best = { t: point.t, value: point.total };
    }
    return best;
}

/**
 * First moment at or after `from` where the level drops to `threshold` or below.
 * Returns null when it never gets there (doses keep landing outside the window).
 */
export function clearTime(options: {
    doses: Dose[];
    halfLifeHours: number;
    threshold: number;
    from: number;
    until?: number;
}): number | null {
    const { doses, halfLifeHours, threshold, from, until } = options;
    if (doses.length === 0) return null;

    const stepMs = 60_000;
    const end = until ?? from + Math.max(48, halfLifeHours * 12) * 3_600_000;

    if (levelAt(doses, from, halfLifeHours) <= threshold) return from;

    for (let t = from; t <= end; t += stepMs) {
        if (levelAt(doses, t, halfLifeHours) <= threshold) return t;
    }
    return null;
}

/**
 * Latest time a dose of `amount` still clears to `threshold` by `bedtime`.
 * Closed form: amount * 2^(-gap/halfLife) <= threshold.
 */
export function latestDoseTime(options: {
    halfLifeHours: number;
    amount: number;
    threshold: number;
    bedtime: number;
}): number {
    const { halfLifeHours, amount, threshold, bedtime } = options;
    if (amount <= 0 || halfLifeHours <= 0) return bedtime;
    if (amount <= threshold) return bedtime;
    const halfLivesNeeded = Math.log2(amount / threshold);
    return bedtime - halfLivesNeeded * halfLifeHours * 3_600_000;
}

/** Preset whose name pattern matches the tracker, else caffeine. */
export function presetForTracker(name: string | null | undefined): HalfLifePreset {
    const haystack = name ?? '';
    return HALF_LIFE_PRESETS.find((preset) => preset.match.test(haystack)) ?? HALF_LIFE_PRESETS[0];
}

/** "23:00" or "07:05" for a clock minute count, wrapping past midnight. */
export function clockLabel(minutes: number): string {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Whole minutes since local midnight. */
export function minutesOfDay(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

/** Local midnight + `minutes` of the day `date` belongs to. */
export function atMinuteOfDay(date: Date, minutes: number): number {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    return result.getTime();
}

export interface DayWindow {
    start: number;
    end: number;
}

/**
 * The day the user is looking at, opening at 04:00 so a late night reads as one
 * day. Before 04:00 the window is the one that started yesterday.
 */
export function windowFor(now: Date, openMinutes = 4 * 60): DayWindow {
    const anchor = new Date(now);
    if (minutesOfDay(now) < openMinutes) anchor.setDate(anchor.getDate() - 1);
    const start = atMinuteOfDay(anchor, openMinutes);
    return { start, end: start + 24 * 3_600_000 };
}
