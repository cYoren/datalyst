'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useOrigin } from '@/lib/useOrigin';

type ApiKey = {
    id: string;
    name: string;
    prefix: string | null;
    scopes: string[];
    createdAt: string;
    lastUsedAt: string | null;
};


function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleDateString() : 'Never';
}

const SCOPE_LABELS: Record<string, string> = {
    read: 'read',
    write: 'write',
    'research:read': 'research read',
    'research:write': 'research write',
    'widget:log': 'check-in from the home screen',
};

function scopeLabels(scopes: string[]) {
    return scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(' + ');
}

export function ApiKeysCard() {
    const origin = useOrigin();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [name, setName] = useState('');
    const [canWrite, setCanWrite] = useState(false);
    const [researchAccess, setResearchAccess] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        const res = await fetch('/api/user/api-keys');
        if (res.ok) setKeys((await res.json()).keys);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/user/api-keys');
                if (res.ok && !cancelled) setKeys((await res.json()).keys);
            } catch {
                if (!cancelled) setError('Unable to load API keys.');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleCreate = async () => {
        setCreating(true);
        setError('');
        setNewKey(null);
        setCopied(false);
        try {
            const res = await fetch('/api/user/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), scopes: researchAccess
                    ? (canWrite ? ['research:read', 'research:write'] : ['research:read'])
                    : (canWrite ? ['read', 'write'] : ['read']) }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Unable to create key.');
            setNewKey(payload.key);
            setName('');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to create key.');
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (key: ApiKey) => {
        if (!window.confirm(`Revoke "${key.name}"? Agents using it lose access right away.`)) return;
        const res = await fetch(`/api/user/api-keys/${key.id}`, { method: 'DELETE' });
        if (!res.ok) setError('Unable to revoke key.');
        await load();
    };

    const copyKey = async () => {
        if (!newKey) return;
        try {
            await navigator.clipboard.writeText(newKey);
            setCopied(true);
        } catch {
            setError('Copy failed. Select the key and copy it manually.');
        }
    };

    return (
        <Card className="p-6 space-y-4 paper-lift mt-6">
            <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">API keys and agents</h2>
                <p className="text-sm text-[var(--text-tertiary)]">
                    Let Claude, ChatGPT, Cursor or your own scripts read your trackers and log Check-ins through the Datalyst MCP server at{' '}
                    <code className="break-all">{`${origin}/api/mcp`}</code>.{' '}
                    <a href="/docs/agent-api#connect-an-agent" className="text-[var(--color-accent)] underline-offset-4 hover:underline">
                        Setup guide
                    </a>
                </p>
            </div>

            {newKey && (
                <div className="space-y-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg-subtle)] p-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                        Copy your new key now. For your security it will not be shown again.
                    </p>
                    <code className="block break-all rounded bg-[var(--color-bg-card)] p-2 text-sm text-[var(--text-primary)] select-all">
                        {newKey}
                    </code>
                    <div className="flex gap-3">
                        <Button size="sm" onClick={copyKey}>{copied ? 'Copied' : 'Copy key'}</Button>
                        <Button size="sm" variant="outline" onClick={() => setNewKey(null)}>Done</Button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <Input
                    label="Key name"
                    value={name}
                    maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="For example, Claude Desktop"
                />
                <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={researchAccess} onChange={event => setResearchAccess(event.target.checked)} />
                    <span>Study research access. This key can read pseudonymous evidence from studies where you are an owner or analyst. Personal trackers are excluded.</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--color-accent)]"
                        checked={canWrite}
                        onChange={(event) => setCanWrite(event.target.checked)}
                    />
                    <span>{researchAccess ? 'Allow creating study drafts. Recruitment and participant consent stay in the app.' : 'Allow writing (log Check-ins and create experiments). Without this the key is read only.'}</span>
                </label>
                <Button onClick={handleCreate} isLoading={creating} disabled={!name.trim()}>
                    Create API key
                </Button>
                {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
            </div>

            {keys.length > 0 && (
                <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                    {keys.map((key) => (
                        <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div className="min-w-0 space-y-1">
                                <p className="font-medium text-[var(--text-primary)]">{key.name}</p>
                                <p className="text-xs text-[var(--text-tertiary)]">
                                    <code>{key.prefix ?? 'legacy'}…</code> · {scopeLabels(key.scopes)} · created {formatDate(key.createdAt)} · last used {formatDate(key.lastUsedAt)}
                                </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => handleRevoke(key)}>Revoke</Button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
