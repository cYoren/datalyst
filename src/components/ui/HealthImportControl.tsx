'use client';

import { useEffect, useState } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CLOUD_URL, SELF_HOSTED } from '@/lib/self-hosted';
import { HEALTH_METRICS, type HealthSource } from '@/lib/health-metrics';
import {
    connectHealth,
    disconnectHealth,
    healthSource,
    openHealthSettings,
    readHealthSetting,
    syncHealth,
    type HealthSetting,
} from '@/lib/health';

const SOURCE_NAME: Record<HealthSource, string> = {
    apple_health: 'Apple Health',
    health_connect: 'Health Connect',
};

const DEFAULT_METRICS = HEALTH_METRICS.map((m) => m.id);

/**
 * Connect Apple Health / Health Connect: pick metrics, see the last sync,
 * disconnect. On web (or an app build without the plugin) Settings shows why
 * it needs the app; `hideWhenUnavailable` renders nothing there instead (onboarding).
 */
export function HealthImportControl({ hideWhenUnavailable = false }: { hideWhenUnavailable?: boolean }) {
    const [source, setSource] = useState<HealthSource | null | undefined>(undefined);
    const [setting, setSetting] = useState<HealthSetting>({ metrics: [], lastSync: null });
    const [picked, setPicked] = useState<string[]>(DEFAULT_METRICS);
    const [busy, setBusy] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const [deleteData, setDeleteData] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void healthSource().then((s) => {
            const current = readHealthSetting();
            setSource(s);
            setSetting(current);
            if (current.metrics.length) setPicked(current.metrics);
        });
    }, []);

    if (source === undefined) return null;
    if (source === null) {
        if (hideWhenUnavailable) return null;
        return (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4">
                <p className="flex items-center gap-3 text-sm font-medium text-[var(--text-primary)]">
                    <HeartPulse className="h-4 w-4 text-[var(--color-accent)]" />
                    Apple Health and Health Connect
                </p>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    Open Datalyst on your iPhone or Android phone to import sleep, steps, heart rate and more automatically.
                    Your correlations start from day one, no manual logging needed.
                </p>
                {SELF_HOSTED && (
                    <a href={`${CLOUD_URL}/?from=self-hosted-health`} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-[44px] items-center text-xs font-medium text-[var(--color-accent)] hover:underline">
                        The phone apps run on Datalyst Cloud. Get them free
                    </a>
                )}
            </div>
        );
    }

    const name = SOURCE_NAME[source];
    const connected = setting.metrics.length > 0;
    const refresh = () => setSetting(readHealthSetting());

    const toggle = (id: string) =>
        setPicked((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

    const connect = async () => {
        setBusy(true);
        setMessage(connected ? 'Updating...' : 'Importing the last 90 days. This can take a moment.');
        const result = await connectHealth(picked);
        setBusy(false);
        refresh();
        setMessage({
            ok: 'Up to date. Your health trackers are on the Data page.',
            partial: `Imported what ${name} allowed. Grant the rest in ${name}, then tap Save metrics.`,
            history: `Imported the last 30 days. ${name} on this phone does not allow older data.`,
            unavailable: `${name} is not available on this phone.`,
            denied: `Datalyst has no access yet. Allow it in ${name}.`,
            failed: 'Import did not finish. It will retry next time you open the app.',
        }[result]);
    };

    const syncNow = async () => {
        setBusy(true);
        const ok = await syncHealth(true);
        setBusy(false);
        refresh();
        setMessage(ok ? 'Up to date.' : 'Sync did not finish. Check your connection and try again.');
    };

    const disconnect = async () => {
        setBusy(true);
        const ok = await disconnectHealth(deleteData);
        setBusy(false);
        setConfirmDisconnect(false);
        refresh();
        setMessage(ok
            ? (deleteData ? 'Disconnected and imported data deleted.' : 'Disconnected. Imported data stays in your history.')
            : 'Imported data could not be deleted, so you are still connected. Check your connection and try again.');
    };

    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4 space-y-3">
            <div>
                <p className="flex items-center gap-3 text-sm font-medium text-[var(--text-primary)]">
                    <HeartPulse className="h-4 w-4 text-[var(--color-accent)]" />
                    {connected ? `Connected to ${name}` : `Connect ${name}`}
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {connected
                        ? `Last sync: ${setting.lastSync ? new Date(setting.lastSync).toLocaleString() : 'not yet'}. Syncs each time you open the app.`
                        : 'Import up to 90 days so your correlations start today. Read only: Datalyst never writes to your health data. Connecting allows Datalyst to process this health data.'}
                </p>
            </div>

            <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <legend className="sr-only">Metrics to import</legend>
                {HEALTH_METRICS.map((m) => (
                    <label key={m.id} className="flex min-h-[44px] items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <input
                            type="checkbox"
                            checked={picked.includes(m.id)}
                            onChange={() => toggle(m.id)}
                            disabled={busy}
                            className="h-5 w-5 accent-[var(--color-accent)]"
                        />
                        <TrackerIcon value={m.icon} className="inline h-4 w-4 -mt-0.5" /> {m.name}
                    </label>
                ))}
            </fieldset>

            <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={connect} isLoading={busy && !confirmDisconnect} disabled={picked.length === 0 || busy}>
                    {connected ? 'Save metrics' : `Connect ${name}`}
                </Button>
                {connected && (
                    <>
                        <Button size="sm" variant="outline" onClick={syncNow} disabled={busy}>Sync now</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)} disabled={busy}>Disconnect</Button>
                    </>
                )}
            </div>

            {confirmDisconnect && (
                <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
                    <p className="text-sm text-[var(--text-secondary)]">
                        Stop importing from {name} on this phone?
                    </p>
                    <label className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                        <input
                            type="checkbox"
                            checked={deleteData}
                            onChange={(e) => setDeleteData(e.target.checked)}
                            className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
                        />
                        Also delete everything imported so far and disconnect other devices. Entries you logged yourself stay.
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={deleteData ? 'destructive' : 'default'} onClick={disconnect} isLoading={busy}>
                            Disconnect
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(false)} disabled={busy}>Cancel</Button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                        To remove the permission itself, use {source === 'apple_health' ? 'the Health app: Profile, Apps, Datalyst' : 'Health Connect settings'}.
                        {source === 'health_connect' && (
                            <> <button type="button" className="underline" onClick={() => void openHealthSettings()}>Open Health Connect</button></>
                        )}
                    </p>
                </div>
            )}

            {message && <p className="text-xs text-[var(--text-secondary)]" role="status">{message}</p>}
        </div>
    );
}
