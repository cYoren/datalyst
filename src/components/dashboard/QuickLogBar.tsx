'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { mutate } from 'swr';
import { ArrowUp, Loader2, Mic, X } from 'lucide-react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { Button } from '@/components/ui/Button';
import { formatLocalDateKey } from '@/lib/dateUtils';

type Proposal = {
    habitId: string; habitName: string; habitIcon: string;
    subvariableId: string; name: string; type: string; unit: string | null;
    numericValue: number; rawValue?: string;
};
type AiState = { configured: boolean; consent: boolean; provider: string | null };

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };
const speechCtor = (): SpeechCtor | null => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noop = () => () => {};

function display(p: Proposal) {
    if (p.type === 'BOOLEAN') return p.numericValue ? 'Yes' : 'No';
    if (p.type === 'CATEGORY') return p.rawValue ?? String(p.numericValue);
    if (p.type === 'SCALE_0_10') return `${p.numericValue} / 10`;
    return `${p.numericValue}${p.unit ? ` ${p.unit}` : ''}`;
}

/**
 * Type or say what happened; the configured LLM maps it to your trackers; you confirm.
 * Hidden when no AI is configured, so the dashboard never shows a dead control.
 */
export function QuickLogBar() {
    const [ai, setAi] = useState<AiState | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState<'parse' | 'save' | null>(null);
    const [proposals, setProposals] = useState<Proposal[] | null>(null);
    const [note, setNote] = useState('');
    const [listening, setListening] = useState(false);
    const recognizer = useRef<InstanceType<SpeechCtor> | null>(null);
    const canListen = useSyncExternalStore(noop, () => speechCtor() !== null, () => false);

    useEffect(() => {
        let active = true;
        fetch('/api/insights/ai/consent').then(r => (r.ok ? r.json() : null)).then(d => {
            if (active && d) setAi({ configured: d.configured, consent: d.consent, provider: d.provider });
        }).catch(() => {});
        return () => { active = false; };
    }, []);

    if (!ai?.configured) return null;

    const parse = async () => {
        if (text.trim().length < 2) return;
        setBusy('parse');
        setNote('');
        setProposals(null);
        try {
            const res = await fetch('/api/log/parse', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setNote(({ budget_exceeded: 'Daily AI limit reached. Log in Check-in below.', rate_limited: 'That was a lot of quick logs in a minute. Try again shortly, or log in Check-in below.', disabled: 'Plain-language logging is switched off here. Log in Check-in below.', consent_required: 'Turn on AI insights in Settings first, or log in Check-in below.' } as Record<string, string>)[data.state] ?? 'Quick log is unavailable right now. Log in Check-in below.');
                return;
            }
            setProposals(data.proposals);
            if (!data.proposals.length) setNote('Nothing matched your trackers. Create one, or ask your AI to.');
            else if (data.unmatched?.length) setNote(`Skipped: ${data.unmatched.join(', ')}`);
        } finally {
            setBusy(null);
        }
    };

    const turnOn = async () => {
        const res = await fetch('/api/insights/ai/consent', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true }),
        });
        if (res.ok) { setAi({ ...ai, consent: true }); await parse(); }
    };

    const save = async () => {
        if (!proposals?.length) return;
        setBusy('save');
        const logicalDate = formatLocalDateKey(new Date());
        const results = await Promise.all(proposals.map(p => fetch('/api/entries/quick', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ habitId: p.habitId, subvariableId: p.subvariableId, numericValue: p.numericValue, rawValue: p.rawValue, logicalDate }),
        }).then(r => r.ok).catch(() => false)));
        const saved = results.filter(Boolean).length;
        await mutate((key) => typeof key === 'string' && key.startsWith('/api/dashboard'));
        setBusy(null);
        setProposals(null);
        setText('');
        setNote(saved === proposals.length ? `Logged ${saved} value${saved === 1 ? '' : 's'}.` : `Logged ${saved} of ${proposals.length}. Try the rest in Check-in.`);
    };

    const listen = () => {
        const Ctor = speechCtor();
        if (!Ctor) return;
        if (listening) { recognizer.current?.stop(); return; }
        const r = new Ctor();
        r.lang = navigator.language || 'en-US';
        r.interimResults = false;
        r.onresult = (e) => setText(prev => `${prev ? `${prev} ` : ''}${e.results[0][0].transcript}`);
        r.onend = () => setListening(false);
        recognizer.current = r;
        setListening(true);
        r.start();
    };

    return (
        <section aria-label="Quick log" className="space-y-3">
            <form
                onSubmit={(e) => { e.preventDefault(); void (ai.consent ? parse() : undefined); }}
                className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-2 shadow-[var(--shadow-card)]"
            >
                <label htmlFor="quick-log" className="sr-only">Log in your own words</label>
                <input
                    id="quick-log"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={500}
                    placeholder="Slept 7h, two coffees, headache 4 after lunch"
                    className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                />
                {canListen && (
                    <button type="button" onClick={listen} aria-label={listening ? 'Stop dictation' : 'Dictate'} aria-pressed={listening}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${listening ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                        <Mic className="h-5 w-5" />
                    </button>
                )}
                <button type="submit" disabled={!ai.consent || busy !== null || text.trim().length < 2} aria-label="Read my log"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition-opacity disabled:opacity-40">
                    {busy === 'parse' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </button>
            </form>

            {!ai.consent && text.trim().length >= 2 && (
                <div className="flex flex-wrap items-center gap-3 px-1 text-sm text-[var(--text-secondary)]">
                    <span>Quick log sends what you type and your tracker names to {ai.provider ?? 'the AI provider'} to match values.</span>
                    <Button size="sm" onClick={turnOn}>Allow and continue</Button>
                </div>
            )}

            {proposals && proposals.length > 0 && (
                <div className="space-y-2 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-3 shadow-[var(--shadow-card)]">
                    <ul className="space-y-1">
                        {proposals.map(p => (
                            <li key={p.subvariableId} className="flex min-h-11 items-center gap-3 px-1 text-sm">
                                <TrackerIcon value={p.habitIcon} className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                                    {p.habitName === p.name ? p.name : `${p.habitName}, ${p.name}`}
                                </span>
                                <span className="font-medium tabular-nums text-[var(--text-primary)]">{display(p)}</span>
                                <button onClick={() => setProposals(proposals.filter(x => x !== p))} aria-label={`Remove ${p.name}`}
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="flex gap-2">
                        <Button onClick={save} isLoading={busy === 'save'}>Log {proposals.length === 1 ? 'it' : `all ${proposals.length}`}</Button>
                        <Button variant="outline" onClick={() => setProposals(null)}>Cancel</Button>
                    </div>
                </div>
            )}
            {note && <p role="status" className="px-1 text-sm text-[var(--text-tertiary)]">{note}</p>}
        </section>
    );
}
