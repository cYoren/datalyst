'use client';

import React from 'react';
import useSWR from 'swr';
import { Loader2, ShieldCheck, Unplug } from 'lucide-react';
import { fetcher } from '@/lib/hooks';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface ConnectedAppView {
    id: string;
    name: string;
    description: string;
    storeLinks: { ios?: string; android?: string } | null;
    writes: { name: string; variables: string[] }[];
    connection: null | {
        keyId: string;
        connectedAt: string;
        lastUsedAt: string | null;
        readable: string[];
        events: { action: string; tracker: string | null; date: string | null; at: string }[];
    };
}

const ACTION_WORDS: Record<string, string> = {
    read: 'read your values',
    write: 'wrote a value',
    delete: 'removed a value it wrote',
    connect: 'connected',
    disconnect: 'disconnected',
};

/**
 * Settings → Connected apps (`docs/CONNECTED-APPS.md`, "In the product").
 *
 * Each app shows what it writes, what it may read, when it last synced and what its key last
 * did — and can be disconnected in one tap, which revokes the key immediately.
 */
export function ConnectedAppsSection() {
    const { data, isLoading, mutate } = useSWR<{ apps: ConnectedAppView[] }>('/api/connected-apps', fetcher);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);

    const disconnect = async (app: ConnectedAppView) => {
        if (!app.connection) return;
        if (!confirm(`Disconnect ${app.name}? It stops reading and writing immediately. The trackers it wrote stay in your record.`)) return;
        setBusy(app.id);
        setMessage(null);
        try {
            const response = await fetch(`/api/user/api-keys/${app.connection.keyId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error();
            setMessage(`${app.name} is disconnected.`);
            await mutate();
        } catch {
            setMessage(`Could not disconnect ${app.name}. Try again.`);
        } finally {
            setBusy(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
            </div>
        );
    }

    const apps = data?.apps ?? [];
    if (apps.length === 0) return null;

    return (
        <div className="space-y-3">
            {apps.map((app) => (
                <Card key={app.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-semibold text-[var(--text-primary)]">{app.name}</h3>
                            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{app.description}</p>
                        </div>
                        <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${app.connection
                                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                                : 'bg-[var(--color-bg-subtle)] text-[var(--text-tertiary)]'}`}
                        >
                            {app.connection ? 'Connected' : 'Not connected'}
                        </span>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <p className="label-mono text-[var(--text-tertiary)]">Writes</p>
                            {app.writes.map((tracker) => (
                                <p key={tracker.name} className="text-[var(--text-primary)]">
                                    {tracker.name}
                                    <span className="block text-xs text-[var(--text-tertiary)]">{tracker.variables.join(', ')}</span>
                                </p>
                            ))}
                        </div>
                        <div>
                            <p className="label-mono text-[var(--text-tertiary)]">May read</p>
                            {app.connection ? (
                                app.connection.readable.length > 0 ? (
                                    <ul className="text-[var(--text-primary)]">
                                        {app.connection.readable.map((name) => <li key={name}>{name}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-[var(--text-secondary)]">Nothing — you shared no variables.</p>
                                )
                            ) : (
                                <p className="text-[var(--text-secondary)]">You choose when you connect.</p>
                            )}
                        </div>
                    </div>

                    {app.connection && (
                        <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
                            <p className="text-xs text-[var(--text-tertiary)]">
                                {app.connection.lastUsedAt
                                    ? `Last synced ${new Date(app.connection.lastUsedAt).toLocaleString()}`
                                    : 'Connected, nothing synced yet'}
                            </p>
                            {app.connection.events.length > 0 && (
                                <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
                                    {app.connection.events.slice(0, 5).map((event, index) => (
                                        <li key={index}>
                                            {new Date(event.at).toLocaleDateString()} · {ACTION_WORDS[event.action] ?? event.action}
                                            {event.tracker ? ` · ${event.tracker}` : ''}
                                            {event.date ? ` · ${event.date}` : ''}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        {app.connection ? (
                            <Button variant="secondary" size="sm" onClick={() => disconnect(app)} disabled={busy === app.id}>
                                {busy === app.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                                Disconnect
                            </Button>
                        ) : (
                            <p className="text-xs text-[var(--text-tertiary)]">
                                Connect from the app: it opens Datalyst and asks what it may read.
                            </p>
                        )}
                        {app.storeLinks?.ios && (
                            <a className="text-xs underline underline-offset-4 text-[var(--text-secondary)]" href={app.storeLinks.ios} target="_blank" rel="noreferrer">App Store</a>
                        )}
                        {app.storeLinks?.android && (
                            <a className="text-xs underline underline-offset-4 text-[var(--text-secondary)]" href={app.storeLinks.android} target="_blank" rel="noreferrer">Google Play</a>
                        )}
                    </div>
                </Card>
            ))}
            {message && <p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p>}
            <p className="flex items-start gap-2 px-1 text-xs text-[var(--text-tertiary)]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                An app key reaches only the app&apos;s own trackers and the variables you ticked. Disconnecting revokes it
                immediately; nothing it wrote is deleted unless you remove it.
            </p>
        </div>
    );
}
