'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface Props {
    app: {
        id: string;
        name: string;
        description: string;
        writes: { name: string; variables: { name: string; unit: string | null; measured: boolean }[] }[];
    };
    request: { redirectUri: string; codeChallenge: string; state: string };
    variables: { id: string; name: string; unit: string | null; habitName: string }[];
    cloud: boolean;
}

/**
 * The connect screen. One screen, two lists: what the app will write, and what it may read —
 * nothing ticked until the person ticks it.
 */
export function ConnectScreen({ app, request, variables, cloud }: Props) {
    const [readable, setReadable] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (id: string) => {
        setReadable((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    };

    const approve = async (grantAll: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/connect/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app: app.id,
                    redirect_uri: request.redirectUri,
                    code_challenge: request.codeChallenge,
                    state: request.state,
                    readableSubvariableIds: grantAll ? variables.map((variable) => variable.id) : readable,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error?.message || 'Could not connect the app.');
            // Back to the app, with a one-time code. Same tab: this is a system-browser flow.
            window.location.href = data.redirectTo;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not connect the app.');
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="space-y-2">
                <p className="label-mono text-[var(--text-tertiary)]">Connect an app</p>
                <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">{app.name}</h1>
                <p className="text-[var(--text-secondary)]">{app.description}</p>
            </header>

            <Card className="p-5 space-y-3">
                <h2 className="font-semibold text-[var(--text-primary)]">What it will write</h2>
                {app.writes.map((tracker) => (
                    <div key={tracker.name} className="space-y-1">
                        <p className="text-sm text-[var(--text-primary)]">{tracker.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {tracker.variables
                                .map((variable) => `${variable.name}${variable.unit ? ` (${variable.unit})` : ''}${variable.measured ? ' · measured' : ''}`)
                                .join(', ')}
                        </p>
                    </div>
                ))}
                <p className="text-xs text-[var(--text-tertiary)]">
                    These are new trackers owned by the app. It cannot write to any of yours.
                </p>
            </Card>

            <Card className="p-5 space-y-3">
                <h2 className="font-semibold text-[var(--text-primary)]">What it may read</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Nothing unless you tick it. A ticked variable is readable for every day it exists, and can be
                    changed or removed later in Settings.
                </p>
                {variables.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">You have no trackers yet, so there is nothing to share.</p>
                ) : (
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                        {variables.map((variable) => (
                            <li key={variable.id}>
                                <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--text-primary)]">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 shrink-0 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                                        checked={readable.includes(variable.id)}
                                        onChange={() => toggle(variable.id)}
                                    />
                                    <span className="min-w-0">
                                        {variable.name}
                                        {variable.unit ? <span className="text-[var(--text-tertiary)]"> · {variable.unit}</span> : null}
                                        <span className="block text-xs text-[var(--text-tertiary)]">{variable.habitName}</span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Card className="p-5 space-y-2">
                <h2 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" /> What it never gets
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Your name, your email, your other trackers, notes, experiments, patterns and export. The key it
                    receives works only for its own trackers and the variables you ticked.
                </p>
                {cloud && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                        Your check-ins stay on this server. {app.name} reads them through the app API only.
                    </p>
                )}
            </Card>

            {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}

            <div className="space-y-2">
                <Button onClick={() => approve(false)} disabled={busy} className="w-full" size="lg">
                    {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…</> : 'Approve'}
                </Button>
                {variables.length > 0 && readable.length < variables.length && (
                    <Button variant="ghost" onClick={() => approve(true)} disabled={busy} className="w-full" size="sm">
                        Share every tracker instead
                    </Button>
                )}
                <p className="text-center text-xs text-[var(--text-tertiary)]">
                    You can disconnect {app.name} at any time in Settings → Connected apps.{' '}
                    <Link href="/settings" className="underline underline-offset-4">
                        Settings <ArrowUpRight className="inline h-3 w-3" />
                    </Link>
                </p>
            </div>
        </div>
    );
}
