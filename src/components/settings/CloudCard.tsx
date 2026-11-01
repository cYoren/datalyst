'use client';

import { useEffect, useState } from 'react';
import { Cloud, Smartphone, HeartPulse, Sparkles, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CLOUD_URL, SELF_HOSTED } from '@/lib/self-hosted';

const HIDE_KEY = 'datalyst.cloudCard.hiddenUntil';

/**
 * Self-hosted only. Shown in Settings, never as a popup: the reader is already
 * thinking about their data. Leads with what they built (loss aversion), lists
 * what Cloud adds in serial-position order (phone first, backups last), and the
 * CTA carries their data across so switching costs nothing.
 */
export function CloudCard({ onExport }: { onExport: () => Promise<void> }) {
    const [trackers, setTrackers] = useState<number | null>(null);
    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        if (!SELF_HOSTED) return;
        const snoozed = () => {
            try { return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now(); } catch { return false; }
        };
        void fetch('/api/habits')
            .then((res) => (res.ok ? res.json() : []))
            .then((habits: unknown[]) => setTrackers(habits.length))
            .catch(() => setTrackers(null))
            .finally(() => setHidden(snoozed()));
    }, []);

    if (!SELF_HOSTED || hidden) return null;

    const hide = () => {
        try { localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 864e5)); } catch { /* still hide this visit */ }
        setHidden(true);
    };

    const move = async () => {
        await onExport();
        window.open(`${CLOUD_URL}/register?from=self-hosted`, '_blank', 'noopener');
    };

    const yours = trackers
        ? `Your ${trackers} tracker${trackers === 1 ? '' : 's'} and every check-in live only on this server.`
        : 'Everything you log lives only on this server.';

    return (
        <Card className="p-6 space-y-4 paper-lift border border-[var(--color-accent)]/40">
            <div className="flex items-start gap-3">
                <Cloud className="mt-1 h-5 w-5 shrink-0 text-[var(--color-accent)]" aria-hidden />
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Take Datalyst with you</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        {yours} Datalyst Cloud keeps the same app and adds what a home server can&apos;t.
                    </p>
                </div>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li className="flex gap-2"><Smartphone className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden /><span><strong className="text-[var(--text-primary)]">iPhone and Android apps</strong> with home screen widgets and reminders. Log in three seconds.</span></li>
                <li className="flex gap-2"><HeartPulse className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden /><span>Apple Health and Health Connect import: sleep, steps, heart rate, filled in for you.</span></li>
                <li className="flex gap-2"><Sparkles className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden /><span>AI insights that explain your results, no API key needed.</span></li>
                <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden /><span><strong className="text-[var(--text-primary)]">Automatic backups.</strong> A dead disk never takes your history with it.</span></li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
                <Button onClick={move}>Move my data to Cloud</Button>
                <button onClick={hide} className="min-h-[44px] px-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                    Not now
                </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">
                Downloads your export, then opens datalyst.one. Import it in Settings there. Your server keeps working either way.
            </p>
        </Card>
    );
}
