'use client';

import { format } from 'date-fns';
import type { HealthDataType, HealthPlugin, HealthSample as NativeSample } from '@capgo/capacitor-health';
import { HEALTH_METRICS, type HealthSample, type HealthSource } from '@/lib/health-metrics';

/**
 * Apple Health / Health Connect import, native only. Read-only. The chosen
 * metrics and last sync are account-scoped in localStorage, backed by a revocable
 * server connection. Each sync re-reads whole local days and the
 * server replaces imported days, so syncing twice is harmless.
 */

const STORAGE_KEY = 'datalyst:health-v2:';
let activeAccountId: string | null = null;
const BACKFILL_DAYS = 90;
const MIN_SYNC_GAP_MS = 10 * 60_000;
const CHUNK = 2000;

/** Which native data type feeds each metric. */
const DATA_TYPE: Record<string, HealthDataType> = {
    sleep: 'sleep',
    steps: 'steps',
    restingHeartRate: 'restingHeartRate',
    hrv: 'heartRateVariability',
    activeEnergy: 'calories',
    exercise: 'workouts',
    weight: 'weight',
    mindfulness: 'mindfulness',
};

export interface HealthSetting {
    ownerId?: string;
    connectionId?: string;
    metrics: string[];
    lastSync: string | null; // ISO
}

export function readHealthSetting(): HealthSetting {
    try {
        // Old settings were not account-bound; never reuse their permission or cursor.
        window.localStorage.removeItem('datalyst:health-v1');
        if (!activeAccountId) return { metrics: [], lastSync: null };
        const raw = window.localStorage.getItem(STORAGE_KEY + activeAccountId);
        if (raw) {
            const setting = JSON.parse(raw) as HealthSetting;
            if (setting.ownerId === activeAccountId && setting.connectionId && Array.isArray(setting.metrics)) return setting;
        }
    } catch {
        /* default */
    }
    return { metrics: [], lastSync: null };
}

function writeHealthSetting(setting: HealthSetting | null) {
    try {
        if (!activeAccountId) return;
        if (setting && setting.ownerId === activeAccountId) window.localStorage.setItem(STORAGE_KEY + activeAccountId, JSON.stringify(setting));
        else if (!setting) window.localStorage.removeItem(STORAGE_KEY + activeAccountId);
    } catch {
        /* next sync just runs again */
    }
}

async function refreshAccount(): Promise<string | null> {
    try {
        const response = await fetch('/api/user', { cache: 'no-store' });
        const profile = response.ok ? await response.json() : null;
        activeAccountId = typeof profile?.id === 'string' ? profile.id : null;
    } catch { activeAccountId = null; }
    return activeAccountId;
}

async function plugin(): Promise<{ health: HealthPlugin; source: HealthSource } | null> {
    if (typeof window === 'undefined') return null;
    try {
        const { Capacitor } = await import('@capacitor/core');
        // Builds shipped before the plugin was added still load this site.
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Health')) return null;
        const { Health } = await import('@capgo/capacitor-health');
        const { available } = await Health.isAvailable();
        if (!available) return null;
        return { health: Health, source: Capacitor.getPlatform() === 'ios' ? 'apple_health' : 'health_connect' };
    } catch {
        return null;
    }
}

/** 'apple_health' / 'health_connect' when this device can import, else null (web, old app build, no Health Connect). */
export async function healthSource(): Promise<HealthSource | null> {
    await refreshAccount();
    return (await plugin())?.source ?? null;
}

const day = (iso: string | Date) => format(new Date(iso), 'yyyy-MM-dd');
/** Sleep belongs to the morning it ends; anything ending after 18:00 counts toward the next night. */
// ponytail: a nap ending after 18:00 lands on the next day; fine for daily correlations.
const sleepDay = (end: string) => day(new Date(new Date(end).getTime() + 6 * 3_600_000));

const SLEEP_KEYS: Record<string, string[]> = {
    asleep: ['sleep_total'],
    light: ['sleep_total'],
    deep: ['sleep_total', 'sleep_deep'],
    rem: ['sleep_total', 'sleep_rem'],
};

function sleepSamples(samples: NativeSample[]): HealthSample[] {
    const out: HealthSample[] = [];
    const push = (state: string | undefined, start: string, end: string) => {
        for (const key of SLEEP_KEYS[state ?? 'asleep'] ?? []) out.push({ key, date: sleepDay(end), start, end });
    };
    for (const s of samples) {
        // Health Connect: one session with stages. HealthKit: one sample per stage.
        if (s.stages?.length) s.stages.forEach((st) => push(st.stage, st.startDate, st.endDate));
        else push(s.sleepState, s.startDate, s.endDate);
    }
    return out;
}

async function readMetric(health: HealthPlugin, metric: string, from: Date, to: Date): Promise<HealthSample[]> {
    const startDate = from.toISOString();
    const endDate = to.toISOString();
    const field = HEALTH_METRICS.find((m) => m.id === metric)!.fields[0].key;
    const limit = 20_000;

    switch (metric) {
        case 'steps':
        case 'activeEnergy':
        case 'restingHeartRate':
        case 'weight': {
            // Daily buckets from the platform's own statistics, which de-duplicate phone + watch.
            const sum = metric === 'steps' || metric === 'activeEnergy';
            const { samples } = await health.queryAggregated({ dataType: DATA_TYPE[metric], startDate, endDate, bucket: 'day', aggregation: sum ? 'sum' : 'average' });
            return samples.map((s) => ({ key: field, date: day(s.startDate), value: s.value }));
        }
        case 'hrv': {
            const { samples } = await health.readSamples({ dataType: 'heartRateVariability', startDate, endDate, limit });
            return samples.map((s) => ({ key: field, date: day(s.startDate), value: s.value }));
        }
        case 'mindfulness': {
            const { samples } = await health.readSamples({ dataType: 'mindfulness', startDate, endDate, limit });
            return samples.map((s) => ({ key: field, date: day(s.startDate), start: s.startDate, end: s.endDate }));
        }
        case 'sleep': {
            // Start a day early so the night before the first day is complete.
            const early = new Date(from.getTime() - 86_400_000).toISOString();
            const { samples } = await health.readSamples({ dataType: 'sleep', startDate: early, endDate, limit });
            return sleepSamples(samples);
        }
        case 'exercise': {
            const out: HealthSample[] = [];
            let anchor: string | undefined;
            do {
                const page = await health.queryWorkouts({ startDate, endDate, limit: 500, anchor, ascending: true });
                for (const w of page.workouts) out.push({ key: field, date: day(w.startDate), start: w.startDate, end: w.endDate });
                anchor = page.workouts.length === 500 ? page.anchor ?? undefined : undefined;
            } while (anchor);
            return out;
        }
        default:
            return [];
    }
}

let inFlight: Promise<boolean> | null = null;

/**
 * Read the chosen metrics and send them. Backfills BACKFILL_DAYS on the first
 * run, then re-reads from the day before the last sync. Returns false on failure.
 */
export function syncHealth(force = false): Promise<boolean> {
    inFlight ??= runSync(force).finally(() => { inFlight = null; });
    return inFlight;
}

async function runSync(force: boolean): Promise<boolean> {
    const ownerId = await refreshAccount();
    if (!ownerId) return false;
    const setting = readHealthSetting();
    if (!setting.metrics.length || !setting.connectionId) return true;
    if (!force && setting.lastSync && Date.now() - Date.parse(setting.lastSync) < MIN_SYNC_GAP_MS) return true;
    const p = await plugin();
    if (!p) return false;

    const now = new Date();
    const from = setting.lastSync ? new Date(setting.lastSync) : new Date(now.getTime() - (BACKFILL_DAYS - 1) * 86_400_000);
    if (setting.lastSync) from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0); // whole local days only, so a day is never replaced by a partial total
    const fromDay = day(from);

    const samples: HealthSample[] = [];
    const read: string[] = [];
    for (const metric of setting.metrics) {
        try {
            samples.push(...(await readMetric(p.health, metric, from, now)).filter((s) => s.date >= fromDay));
            read.push(metric);
        } catch {
            /* permission revoked or type unsupported: skip it, and never let the server treat it as "no data" */
        }
    }
    if (!read.length) return false;

    // Days must not straddle chunks, or a later chunk would replace a day with part of its samples.
    samples.sort((a, b) => a.date.localeCompare(b.date));
    const chunks: HealthSample[][] = [];
    for (const s of samples) {
        const last = chunks.at(-1);
        if (!last || (last.length >= CHUNK && last.at(-1)!.date !== s.date)) chunks.push([s]);
        else last.push(s);
    }
    if (!chunks.length) chunks.push([]); // still creates the trackers, and clears days deleted at the source

    // Each chunk owns the local days [from, until), gaps included, so the server can drop days that vanished.
    const tomorrow = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    try {
        for (const [i, chunk] of chunks.entries()) {
            // Disconnected mid-sync (maybe with "delete imported data"): send nothing more.
            if (await refreshAccount() !== ownerId || readHealthSetting().connectionId !== setting.connectionId) return false;
            const res = await fetch('/api/health/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectionId: setting.connectionId,
                    source: p.source,
                    metrics: read,
                    samples: chunk,
                    from: i === 0 ? fromDay : chunk[0].date,
                    until: chunks[i + 1]?.[0].date ?? tomorrow,
                }),
            });
            if (!res.ok) return false;
        }
    } catch {
        return false;
    }
    // Re-read: the user may have disconnected while this sync ran. A metric that
    // failed to read keeps the cursor where it was, so it is retried from there.
    const latest = readHealthSetting();
    if (activeAccountId === ownerId && latest.connectionId === setting.connectionId && latest.metrics.length && read.length === setting.metrics.length) writeHealthSetting({ ...latest, lastSync: now.toISOString() });
    return true;
}

export type ConnectResult = 'ok' | 'partial' | 'history' | 'unavailable' | 'denied' | 'failed';

/**
 * Ask the OS for read access, remember the granted metrics, record consent, and backfill.
 * 'partial': some metrics were not granted. 'history': Health Connect only allowed the last 30 days.
 */
export async function connectHealth(picked: string[]): Promise<ConnectResult> {
    const ownerId = await refreshAccount();
    if (!ownerId || !picked.length || picked.some(m => !DATA_TYPE[m])) return 'failed';
    const previous = readHealthSetting();
    const p = await plugin();
    if (!p) return 'unavailable';
    let metrics = picked;
    let history = true;
    try {
        const status = await p.health.requestAuthorization({ read: picked.map((m) => DATA_TYPE[m]), requestHistoryAccess: true });
        // HealthKit never reveals read denials; Health Connect does, so keep only what it granted.
        // A metric granted later then counts as newly added and gets its own backfill.
        if (p.source === 'health_connect') {
            metrics = picked.filter((m) => status.readAuthorized.includes(DATA_TYPE[m]));
            history = status.historyAccessAuthorized !== false;
        }
        if (!metrics.length) return 'denied';
        if (await refreshAccount() !== ownerId) return 'failed';
        const consent = await fetch('/api/health/connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consent: true, expectedUserId: ownerId, source: p.source, previousConnectionId: previous.connectionId }),
        });
        if (!consent.ok) return 'failed';
        const connection = await consent.json();
        if (connection.userId !== ownerId || typeof connection.id !== 'string' || await refreshAccount() !== ownerId) return 'failed';
        const added = metrics.some(m => !previous.metrics.includes(m));
        writeHealthSetting({ ownerId, connectionId: connection.id, metrics, lastSync: added ? null : previous.lastSync });
    } catch {
        return 'failed';
    }
    if (inFlight) await inFlight;
    if (!(await syncHealth(true))) return 'failed';
    if (metrics.length < picked.length) return 'partial';
    return history ? 'ok' : 'history';
}

/**
 * Stop syncing on this device; optionally delete everything imported. When the
 * delete fails the connection is kept, so the user can retry from the same screen.
 */
export async function disconnectHealth(deleteData: boolean): Promise<boolean> {
    const ownerId = await refreshAccount();
    const setting = readHealthSetting();
    if (!ownerId || !setting.connectionId) return false;
    try {
        const response = await fetch('/api/health/import', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: setting.connectionId, deleteData }) });
        if (!response.ok || await refreshAccount() !== ownerId) return false;
    } catch { return false; }
    writeHealthSetting(null);
    return true;
}

/** Android only: OS screen where the user can revoke Health Connect access. */
export async function openHealthSettings(): Promise<void> {
    try {
        await (await plugin())?.health.openHealthConnectSettings();
    } catch {
        /* nothing to open */
    }
}
