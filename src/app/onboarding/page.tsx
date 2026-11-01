'use client';

import React, { useState, useMemo, useRef } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ReminderControl } from '@/components/ui/ReminderControl';
import { HealthImportControl } from '@/components/ui/HealthImportControl';
import { Loader2, ArrowRight, ArrowLeft, Play, Check } from 'lucide-react';
import { getBundlesForFocusArea, getTemplateById } from '@/lib/templates';

const FOCUS_AREAS = [
    { name: 'Symptoms', icon: 'brain', hint: 'Migraine, gut, pain, cycle' },
    { name: 'Physical Health', icon: 'dumbbell', hint: 'Sleep, training, recovery' },
    { name: 'Mental Wellness', icon: 'smile', hint: 'Mood, stress, energy' },
    { name: 'Productivity', icon: 'target', hint: 'Focus, deep work, habits' },
    { name: 'Learning', icon: 'book', hint: 'Study time, retention' },
    { name: 'Finance', icon: 'wallet', hint: 'Spending and what drives it' },
    { name: 'Habits & Life', icon: 'leaf', hint: 'Water, family, home, hobbies' },
];
const HEALTH_FOCUS = ['Symptoms', 'Physical Health', 'Mental Wellness'];

// Two steps, then straight into the first check-in. The "how it works" slide
// lived here before; the landing page already sells that, and every extra
// screen before the first log loses people.
export default function OnboardingPage() {
    const router = useRouter();
    const [focus, setFocus] = useState('');
    const [loading, setLoading] = useState<'start' | 'demo' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedBundles, setSelectedBundles] = useState<Set<string>>(new Set());
    const [healthDataConsent, setHealthDataConsent] = useState(false);
    // Trackers already created, so a retry after a network failure does not duplicate them.
    const created = useRef(new Set<string>());

    const availableBundles = useMemo(() => getBundlesForFocusArea(focus), [focus]);
    const needsConsent = HEALTH_FOCUS.includes(focus);

    const pickFocus = (name: string) => {
        setFocus(name);
        const first = getBundlesForFocusArea(name)[0];
        setSelectedBundles(new Set(first ? [first.id] : []));
        window.scrollTo(0, 0);
    };

    const toggleBundle = (bundleId: string) => {
        setSelectedBundles(prev => {
            const next = new Set(prev);
            if (next.has(bundleId)) next.delete(bundleId);
            else next.add(bundleId);
            return next;
        });
    };

    const post = async (url: string, body: unknown, method = 'POST') => {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
    };

    const handleComplete = async () => {
        setLoading('start');
        setError(null);
        try {
            const templateIds = new Set(
                availableBundles.filter(b => selectedBundles.has(b.id)).flatMap(b => b.protocolIds)
            );
            for (const templateId of templateIds) {
                const template = getTemplateById(templateId);
                if (!template || created.current.has(templateId)) continue;
                await post('/api/habits', {
                    name: template.name,
                    description: template.description,
                    icon: template.icon,
                    color: template.color,
                    subvariables: template.subvariables.map(sv => ({
                        name: sv.name,
                        type: sv.type,
                        unit: sv.unit || undefined,
                        order: sv.order,
                        metadata: sv.metadata || {},
                    })),
                });
                created.current.add(templateId);
            }
            // Marked complete last, so a failed tracker create can be retried here.
            await post('/api/user', {
                onboardingCompleted: true,
                ...(healthDataConsent && { healthDataConsent: true }),
            }, 'PATCH');

            router.push('/dashboard');
            router.refresh();
        } catch (err) {
            console.error('Onboarding error:', err);
            setError('Something went wrong setting up your trackers. Check your connection and try again.');
            setLoading(null);
        }
    };

    const handleDemoSetup = async () => {
        setLoading('demo');
        setError(null);
        try {
            await post('/api/demo/setup', {});
            router.push('/dashboard');
            router.refresh();
        } catch (err) {
            console.error('Demo setup error:', err);
            setError('Could not load the sample data. Try again.');
            setLoading(null);
        }
    };

    const startDisabled = selectedBundles.size === 0 || loading !== null || (needsConsent && !healthDataConsent);

    return (
        <div className="min-h-dvh bg-[var(--color-bg-page)] sm:flex sm:items-center sm:justify-center sm:p-4">
            <div className="flex min-h-dvh w-full flex-col bg-[var(--color-bg-card)] px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[var(--radius-card)] sm:p-8 sm:shadow-[var(--shadow-card)]">
                <div className="mb-6 flex gap-2" aria-hidden>
                    {[1, 2].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full ${i === 1 || focus ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`} />
                    ))}
                </div>

                {!focus ? (
                    <div className="animate-fade-in flex flex-1 flex-col">
                        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] sm:text-3xl">
                            What do you want to understand?
                        </h1>
                        <p className="mt-2 text-[var(--text-secondary)]">
                            Log a few things daily. After 14 days Datalyst shows you what actually moves the needle for you.
                        </p>

                        <div className="mt-6 grid gap-3">
                            {FOCUS_AREAS.map((opt) => (
                                <button
                                    key={opt.name}
                                    onClick={() => pickFocus(opt.name)}
                                    className="flex min-h-[64px] items-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] px-4 text-left transition-colors hover:ring-1 hover:ring-[var(--color-border-hover)]"
                                >
                                    <TrackerIcon value={opt.icon} className="h-6 w-6 text-[var(--color-accent)]" />
                                    <span className="flex-1">
                                        <span className="block font-semibold text-[var(--text-primary)]">{opt.name}</span>
                                        <span className="block text-sm text-[var(--text-tertiary)]">{opt.hint}</span>
                                    </span>
                                    <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                                </button>
                            ))}
                        </div>

                        <div className="mt-auto pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 text-center sm:pb-0">
                            <button
                                onClick={handleDemoSetup}
                                disabled={loading !== null}
                                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--color-accent)]"
                            >
                                {loading === 'demo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                Just looking? Explore with 30 days of sample data
                            </button>
                            {error && <p className="mt-2 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in flex flex-1 flex-col">
                        <button
                            onClick={() => setFocus('')}
                            className="-ml-2 mb-2 inline-flex min-h-[44px] w-fit items-center gap-1 px-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                        >
                            <ArrowLeft className="h-4 w-4" /> {focus}
                        </button>
                        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] sm:text-3xl">
                            Pick what to track
                        </h1>
                        <p className="mt-2 text-[var(--text-secondary)]">
                            Each set is 2 or 3 trackers chosen so their patterns show up together. You can change them anytime.
                        </p>

                        <div className="mt-6 space-y-3">
                            {availableBundles.map((bundle) => {
                                const isSelected = selectedBundles.has(bundle.id);
                                const protocols = bundle.protocolIds.map(id => getTemplateById(id)).filter(Boolean);
                                return (
                                    <button
                                        key={bundle.id}
                                        onClick={() => toggleBundle(bundle.id)}
                                        aria-pressed={isSelected}
                                        className={`w-full rounded-[var(--radius-card)] p-4 text-left transition-colors ${isSelected
                                            ? 'bg-[var(--color-bg-subtle)] ring-2 ring-[var(--color-accent)]'
                                            : 'bg-[var(--color-bg-subtle)] hover:ring-1 hover:ring-[var(--color-border-hover)]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-semibold text-[var(--text-primary)]">
                                                <TrackerIcon value={bundle.icon} className="inline h-4 w-4 -mt-0.5 mr-1.5 text-[var(--color-accent)]" />{bundle.name}
                                            </span>
                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-transparent bg-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>
                                                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{bundle.description}</p>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                                            {protocols.map(t => t && (
                                                <span key={t.id} className="text-sm text-[var(--text-secondary)]">
                                                    <TrackerIcon value={t.icon} className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />{t.name}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6">
                            <ReminderControl />
                        </div>

                        <div className="mt-4">
                            <HealthImportControl hideWhenUnavailable />
                        </div>

                        {needsConsent && (
                            <label className="mt-4 flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                                    checked={healthDataConsent}
                                    onChange={(event) => setHealthDataConsent(event.target.checked)}
                                />
                                <span>
                                    I consent to Datalyst processing the health-related data I log (like sleep or mood) to show me insights.
                                    <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Required for this focus. You can withdraw it in Settings.</span>
                                </span>
                            </label>
                        )}

                        <div className="sticky bottom-0 -mx-5 mt-auto bg-[var(--color-bg-card)] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:static sm:mx-0 sm:px-0 sm:pb-0">
                            {error && <p className="mb-3 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
                            <Button onClick={handleComplete} disabled={startDisabled} className="w-full" size="lg">
                                {loading === 'start' ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up...</>
                                ) : selectedBundles.size === 0 ? (
                                    'Pick at least one set'
                                ) : (
                                    <>Start my first check-in <ArrowRight className="ml-2 h-4 w-4" /></>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
