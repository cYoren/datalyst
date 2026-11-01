'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/hooks';

export default function ExperimentProofs({ id }: { id: string }) {
    const url = `/api/experiments/${encodeURIComponent(id)}/attestations`;
    const { data, mutate } = useSWR<{ records: { kind: string; mode: string; status: string }[] }>(url, fetcher);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function retry() {
        setBusy(true); setError('');
        try {
            const response = await fetch(url, { method: 'POST' });
            if (!response.ok) throw new Error('Proofs could not be refreshed');
            await mutate();
        } catch { setError('Proofs could not be refreshed. Please try again.'); }
        finally { setBusy(false); }
    }
    return <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 space-y-3">
        <h2 className="font-semibold text-[var(--color-text-primary)]">Research record</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Your plan is frozen when the experiment starts, and observations are frozen at completion. Signatures verify content integrity; they do not validate the finding.</p>
        {data?.records?.map(record => <p key={record.kind} className="text-sm text-[var(--color-text-secondary)]">
            {record.kind === 'PREREG' ? 'Registered plan' : 'Frozen results'}: {record.status === 'SIGNED' ? 'Signed offchain' : record.status === 'CONFIRMED' ? 'Anchored on Base' : record.status === 'UNAVAILABLE' ? 'Frozen; signing not configured' : 'Frozen; proof pending'}
        </p>)}
        {data?.records?.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">Start a new experiment to freeze a plan. Older experiments cannot be preregistered retroactively.</p>}
        <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href={url} className="min-h-11 inline-flex items-center text-[var(--color-accent)]">Export proof bundle</a>
            <Link href="/verify" className="min-h-11 inline-flex items-center text-[var(--color-accent)]">Verify a record</Link>
            <button onClick={retry} disabled={busy} className="min-h-11 text-[var(--color-accent)] disabled:opacity-50">{busy ? 'Checking…' : 'Retry signing'}</button>
        </div>
        {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
        <p className="text-xs text-[var(--color-text-secondary)]">Exported bundles contain your experiment data. Sharing is your choice. Offchain signatures have no independently verified timestamp.</p>
    </section>;
}
