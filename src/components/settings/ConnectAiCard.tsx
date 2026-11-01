'use client';

import { useState } from 'react';
import { Check, Copy, MessageSquareText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOrigin } from '@/lib/useOrigin';
import { SELF_HOSTED } from '@/lib/self-hosted';

type Client = { id: string; name: string; steps: (origin: string, key: string) => { text: string; copy?: string }[] };

const CLIENTS: Client[] = [
    {
        id: 'claude', name: 'Claude',
        steps: (o, k) => [
            { text: 'In Claude, open Settings, then Connectors, then Add custom connector. Paste this URL:', copy: `${o}/api/mcp/${k}` },
        ],
    },
    {
        id: 'chatgpt', name: 'ChatGPT',
        steps: (o, k) => [
            { text: 'In ChatGPT, open Settings, then Apps and Connectors, turn on Developer mode, then Create. Paste this URL and choose No authentication:', copy: `${o}/api/mcp/${k}` },
        ],
    },
    {
        id: 'claude-code', name: 'Claude Code',
        steps: (o, k) => [
            { text: 'Run this once in your terminal:', copy: `claude mcp add --transport http datalyst ${o}/api/mcp --header "Authorization: Bearer ${k}"` },
        ],
    },
    {
        id: 'cursor', name: 'Cursor and others',
        steps: (o, k) => [
            { text: 'Add this to your MCP settings (Cursor: ~/.cursor/mcp.json):', copy: JSON.stringify({ mcpServers: { datalyst: { url: `${o}/api/mcp`, headers: { Authorization: `Bearer ${k}` } } } }, null, 2) },
        ],
    },
];

// Our own clients only talk to Datalyst Cloud, so self-hosted servers don't list them.
const CLOUD_CLIENTS: Client[] = [
    {
        id: 'chrome', name: 'Chrome',
        steps: (_o, k) => [{ text: 'Install Datalyst for Chrome, open it from the toolbar and paste this key:', copy: k }],
    },
    {
        id: 'watch', name: 'Apple Watch',
        steps: (_o, k) => [{ text: 'Open Datalyst on your Apple Watch, tap Connect and enter this key:', copy: k }],
    },
];
const ALL_CLIENTS = SELF_HOSTED ? CLIENTS : [...CLIENTS, ...CLOUD_CLIENTS];

/**
 * One tap: creates a read + write key for the chosen assistant and shows exactly what to paste.
 * After that the user logs by talking: "slept 6 hours, headache 7 at 3pm".
 */
export function ConnectAiCard() {
    const [client, setClient] = useState<Client>(CLIENTS[0]);
    const [key, setKey] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState('');

    const origin = useOrigin();
    const isLocal = /\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(origin);

    const connect = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/user/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: client.name, scopes: ['read', 'write'] }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Could not create a key.');
            setKey(payload.key);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create a key.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(value);
        } catch {
            setError('Copy failed. Select the text and copy it.');
        }
    };

    return (
        <Card id="connect-ai" className="p-6 space-y-5 scroll-mt-24">
            <div className="flex items-start gap-3">
                <MessageSquareText className="mt-1 h-5 w-5 shrink-0 text-[var(--color-accent)]" aria-hidden />
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Log by talking to your AI</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Tell Claude or ChatGPT &ldquo;slept 6 hours, headache 7 this afternoon&rdquo; and it logs it here.
                        It can also start new trackers, check today and read your results.
                    </p>
                </div>
            </div>

            <div role="tablist" aria-label="Assistant" className="flex flex-wrap gap-2">
                {ALL_CLIENTS.map((c) => (
                    <button
                        key={c.id}
                        role="tab"
                        aria-selected={client.id === c.id}
                        onClick={() => { setClient(c); setKey(null); setCopied(null); }}
                        className={cn(
                            'min-h-[44px] rounded-full px-4 text-sm font-medium transition-colors',
                            client.id === c.id
                                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent,#fff)]'
                                : 'bg-[var(--color-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        )}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {!key ? (
                <Button onClick={connect} isLoading={busy}>Connect {client.name}</Button>
            ) : (
                <div className="space-y-4">
                    {client.steps(origin, key).map((step) => (
                        <div key={step.text} className="space-y-2">
                            <p className="text-sm text-[var(--text-secondary)]">{step.text}</p>
                            {step.copy && (
                                <div className="flex items-start gap-2">
                                    <code className="block min-w-0 flex-1 whitespace-pre-wrap break-all rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] p-3 text-xs text-[var(--text-primary)] select-all">
                                        {step.copy}
                                    </code>
                                    <button
                                        onClick={() => void copy(step.copy!)}
                                        aria-label="Copy"
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--text-primary)]"
                                    >
                                        {copied === step.copy ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    <p className="text-xs text-[var(--text-tertiary)]">
                        This link contains a private key shown only once. Revoke it any time under API keys below.
                    </p>
                </div>
            )}
            {isLocal && (client.id === 'claude' || client.id === 'chatgpt') && (
                <p className="text-xs text-[var(--text-tertiary)]">
                    Claude and ChatGPT on the web can&apos;t reach a server on your own network. Use Claude Code or Cursor here,
                    or put your server behind a public address.
                </p>
            )}
            {error && <p className="text-sm text-[var(--color-error)]" role="alert">{error}</p>}
        </Card>
    );
}
