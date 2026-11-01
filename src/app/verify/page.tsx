'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function VerifyPage() {
    const [bundle, setBundle] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ valid?: boolean; signedByDatalyst?: boolean; message?: string; error?: string; proofs?: { kind: string; mode: string; signer: string; uid: string }[] } | null>(null);
    async function verify() {
        setBusy(true); setResult(null);
        try {
            const response = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bundle });
            setResult(await response.json());
        } catch { setResult({ error: 'Verification is unavailable. Please try again.' }); }
        finally { setBusy(false); }
    }
    return <main className="min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text-primary)] px-5 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
            <Link href="/lab" className="text-sm text-[var(--color-accent)]">← Lab (Advanced)</Link>
            <div><p className="text-xs text-[var(--color-text-secondary)]">Verifiable research</p>
                <h1 className="mt-2 text-3xl font-semibold">Verify an experiment record</h1></div>
            <p className="text-[var(--color-text-secondary)]">Check that a frozen plan and its results match their signed hashes. A signature proves content integrity; it does not prove that a finding is true or medically valid.</p>
            <div className="rounded-2xl bg-[var(--color-bg-card)] p-5 space-y-4">
                <label htmlFor="proof-bundle" className="block text-sm font-medium">Proof bundle JSON</label>
                <textarea id="proof-bundle" value={bundle} onChange={e => setBundle(e.target.value)} rows={12} spellCheck={false}
                    className="w-full resize-y rounded-xl bg-[var(--color-bg-subtle)] p-3 font-mono text-xs focus:outline-2 focus:outline-[var(--color-accent)]"
                    placeholder="Paste the proof bundle exported from Lab" />
                <p className="text-xs text-[var(--color-text-secondary)]">Verification sends this bundle to Datalyst. Paste only records you are authorized to share. Offchain verification needs no wallet or network transaction.</p>
                <button type="button" onClick={verify} disabled={busy || !bundle.trim()} className="min-h-11 rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Verify content integrity'}</button>
            </div>
            {result && <section aria-live="polite" className="rounded-2xl bg-[var(--color-bg-card)] p-5 space-y-3">
                <h2 className="font-semibold">{result.valid ? 'Content integrity verified' : 'Verification failed'}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">{result.error || result.message}</p>
                {result.valid && <p className="text-sm">{result.signedByDatalyst ? 'Signer matches the configured Datalyst signer.' : 'Signer identity is not trusted by this Datalyst instance. A valid signature alone does not establish identity.'}</p>}
                {result.proofs?.map(proof => <div key={proof.kind} className="text-xs space-y-1"><p>{proof.kind === 'PREREG' ? 'Registered plan' : 'Frozen results'} · {proof.mode === 'offchain' ? 'Offchain signature; no independent timestamp' : 'Base onchain record'}</p><p className="break-all">Signer: {proof.signer}</p><p className="break-all">UID: {proof.uid}</p></div>)}
            </section>}
        </div>
    </main>;
}
