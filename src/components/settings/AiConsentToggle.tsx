'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/hooks';

/**
 * The second consent (`ROADMAP.md` A6): AI explanations read tracker data only when the person
 * has said yes, and withdrawing it deletes the answers already generated (the API does that).
 */
export function AiConsentToggle() {
    const { data, mutate } = useSWR<{ consent: boolean; configured: boolean; provider: string | null }>(
        '/api/insights/ai/consent',
        fetcher,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const consent = Boolean(data?.consent);

    const toggle = async (next: boolean) => {
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/insights/ai/consent', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ consent: next }),
            });
            if (!response.ok) throw new Error('Could not save that preference.');
            await mutate();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save that preference.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-1">
            <label className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                <input
                    type="checkbox"
                    className="mt-1 h-11 w-11 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    checked={consent}
                    disabled={saving || !data}
                    onChange={(event) => void toggle(event.target.checked)}
                />
                <span>
                    I consent to AI explanations reading my tracker names, types and units so it can describe a
                    pattern in words. Your notes and the values you logged are not sent.
                    {data?.provider ? ` Answers come from ${data.provider}.` : ''}
                    {consent ? ' Turning this off deletes the answers already generated.' : ''}
                </span>
            </label>
            {error && <p className="text-xs text-[var(--color-coral)]" role="alert">{error}</p>}
        </div>
    );
}
