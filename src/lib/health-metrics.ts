import { z } from 'zod';

/**
 * Apple Health / Health Connect import, shared by the app (what to read) and
 * the server (which tracker to write to, how to fold samples into one value
 * per local day). Pure: no Prisma, no Capacitor.
 */

type Agg = 'sum' | 'avg' | 'union';
type Goal = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'NEUTRAL';

export interface HealthField {
    key: string;
    name: string;
    unit: string;
    /** union: overlapping [start, end] intervals are merged, so two sources recording the same night count once. */
    agg: Agg;
    goal: Goal;
    decimals: number;
    /** union only: minutes are multiplied by this (1/60 gives hours). */
    scale?: number;
}

export interface HealthMetric {
    id: string;
    name: string;
    icon: string;
    color: string;
    fields: HealthField[];
}

export const HEALTH_METRICS: HealthMetric[] = [
    {
        id: 'sleep', name: 'Sleep', icon: 'moon', color: '#6366f1', fields: [
            { key: 'sleep_total', name: 'Sleep duration', unit: 'hours', agg: 'union', goal: 'HIGHER_BETTER', decimals: 2, scale: 1 / 60 },
            { key: 'sleep_deep', name: 'Deep sleep', unit: 'hours', agg: 'union', goal: 'HIGHER_BETTER', decimals: 2, scale: 1 / 60 },
            { key: 'sleep_rem', name: 'REM sleep', unit: 'hours', agg: 'union', goal: 'HIGHER_BETTER', decimals: 2, scale: 1 / 60 },
        ],
    },
    { id: 'steps', name: 'Steps', icon: 'steps', color: '#10b981', fields: [{ key: 'steps', name: 'Steps', unit: 'steps', agg: 'sum', goal: 'HIGHER_BETTER', decimals: 0 }] },
    { id: 'restingHeartRate', name: 'Resting heart rate', icon: 'heart', color: '#ef4444', fields: [{ key: 'resting_hr', name: 'Resting heart rate', unit: 'bpm', agg: 'avg', goal: 'LOWER_BETTER', decimals: 1 }] },
    { id: 'hrv', name: 'Heart rate variability', icon: 'heart-pulse', color: '#ec4899', fields: [{ key: 'hrv', name: 'HRV', unit: 'ms', agg: 'avg', goal: 'HIGHER_BETTER', decimals: 1 }] },
    { id: 'activeEnergy', name: 'Active energy', icon: 'flame', color: '#f97316', fields: [{ key: 'active_energy', name: 'Active energy', unit: 'kcal', agg: 'sum', goal: 'NEUTRAL', decimals: 0 }] },
    { id: 'exercise', name: 'Exercise', icon: 'activity', color: '#0ea5e9', fields: [{ key: 'exercise', name: 'Exercise minutes', unit: 'minutes', agg: 'union', goal: 'HIGHER_BETTER', decimals: 0, scale: 1 }] },
    { id: 'weight', name: 'Weight', icon: 'scale', color: '#64748b', fields: [{ key: 'weight', name: 'Weight', unit: 'kg', agg: 'avg', goal: 'NEUTRAL', decimals: 2 }] },
    { id: 'mindfulness', name: 'Mindful minutes', icon: 'meditation', color: '#14b8a6', fields: [{ key: 'mindful', name: 'Mindful minutes', unit: 'minutes', agg: 'union', goal: 'HIGHER_BETTER', decimals: 0, scale: 1 }] },
];

const FIELDS = new Map(HEALTH_METRICS.flatMap((m) => m.fields.map((f) => [f.key, f] as const)));
const METRIC_IDS = HEALTH_METRICS.map((m) => m.id) as [string, ...string[]];
const FIELD_KEYS = [...FIELDS.keys()] as [string, ...string[]];

export const HEALTH_SOURCES = ['apple_health', 'health_connect'] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

const isoDate = z.iso.date();
const sampleSchema = z.object({
    key: z.enum(FIELD_KEYS),
    /** The device's local day the sample belongs to; the server never derives it from its own clock. */
    date: isoDate,
    value: z.number().finite().min(0).max(1e6).optional(),
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
}).refine((s) => FIELDS.get(s.key)!.agg === 'union' ? !!s.start && !!s.end : s.value !== undefined, {
    message: 'union fields need start and end, others need value',
}).refine((s) => !s.start || !s.end || Date.parse(s.end) > Date.parse(s.start), {
    message: 'interval end must follow start',
});
export type HealthSample = z.infer<typeof sampleSchema>;

export const MAX_SAMPLES_PER_REQUEST = 5000;
export const importSchema = z.object({
    connectionId: z.string().min(1).max(100),
    source: z.enum(HEALTH_SOURCES),
    metrics: z.array(z.enum(METRIC_IDS)).min(1).max(METRIC_IDS.length),
    /** Every sample for each day sent, so a day is always replaced by its full total, never added to. */
    samples: z.array(sampleSchema).max(MAX_SAMPLES_PER_REQUEST),
    /**
     * Local days [from, until) this batch fully describes. An imported day in it
     * with no samples any more (deleted in the health app) is removed.
     */
    from: isoDate,
    until: isoDate,
}).refine((b) => b.from < b.until, { message: 'from must be before until' });

function round(value: number, decimals: number) {
    const f = 10 ** decimals;
    return Math.round(value * f) / f;
}

/** Total minutes covered by the intervals, overlaps counted once. */
export function unionMinutes(intervals: Array<[number, number]>): number {
    const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
    let total = 0;
    let curStart = -Infinity;
    let curEnd = -Infinity;
    for (const [s, e] of sorted) {
        if (s > curEnd) {
            if (curEnd > curStart) total += curEnd - curStart;
            curStart = s;
            curEnd = e;
        } else if (e > curEnd) {
            curEnd = e;
        }
    }
    if (curEnd > curStart) total += curEnd - curStart;
    return total / 60_000;
}

/** Fold samples into { date: { fieldKey: value } }. */
export function aggregateDaily(samples: HealthSample[]): Record<string, Record<string, number>> {
    const groups = new Map<string, HealthSample[]>();
    for (const s of samples) {
        const id = `${s.date}|${s.key}`;
        const list = groups.get(id);
        if (list) list.push(s);
        else groups.set(id, [s]);
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [id, list] of groups) {
        const [date, key] = id.split('|');
        const field = FIELDS.get(key)!;
        let value: number;
        if (field.agg === 'union') {
            value = unionMinutes(list.map((s) => [Date.parse(s.start!), Date.parse(s.end!)])) * (field.scale ?? 1);
        } else {
            const sum = list.reduce((acc, s) => acc + s.value!, 0);
            value = field.agg === 'sum' ? sum : sum / list.length;
        }
        (out[date] ??= {})[key] = round(value, field.decimals);
    }
    return out;
}

export interface ExistingEntry {
    id: string;
    date: string;
    /** null = logged by hand. */
    source: string | null;
}

export interface ImportPlan {
    create: string[];
    update: Array<{ date: string; entryId: string }>;
    skippedManual: string[];
    /** Imported entries for days no longer present in the source. */
    remove: string[];
}

/**
 * Per tracker: which days to create, which imported entries to refresh, and
 * which to leave alone because the user logged that day by hand. A manual
 * entry always wins; re-running the same import only updates. `existing` must
 * cover the whole synced range: imported days missing from `days` are removed.
 */
export function planImport(days: string[], existing: ExistingEntry[]): ImportPlan {
    const plan: ImportPlan = { create: [], update: [], skippedManual: [], remove: [] };
    plan.remove = existing.filter((e) => e.source !== null && !days.includes(e.date)).map((e) => e.id);
    for (const date of days) {
        const sameDay = existing.filter((e) => e.date === date);
        if (sameDay.some((e) => e.source === null)) plan.skippedManual.push(date);
        else if (sameDay.length) plan.update.push({ date, entryId: sameDay[0].id });
        else plan.create.push(date);
    }
    return plan;
}

/** Imported entries are stored at UTC midnight of the local day, like parseISO(date) on the UTC server. */
export function dayToLogicalDate(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}
