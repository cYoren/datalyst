import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { withCanonical } from '@/lib/brand';
import { conditionPath, listConditions } from '@/lib/conditions';

export const metadata: Metadata = withCanonical('/conditions', {
    title: 'Condition trackers: migraine, POTS, IBS, menopause | Datalyst',
    description: 'What to log for migraine, POTS, IBS and menopause, and what a month of your own data can show you before an appointment.',
});

export default function ConditionsIndexPage() {
    const conditions = listConditions();

    return (
        <div className="min-h-screen bg-[var(--color-bg-subtle)]">
            <div className="mx-auto max-w-4xl px-4 py-16">
                <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-violet)]">Conditions</p>
                <h1 className="mt-3 text-4xl font-bold text-[var(--color-text-primary)]">Track a condition you already have a name for</h1>
                <p className="mt-4 text-xl leading-relaxed text-[var(--color-text-secondary)]">
                    Datalyst does not diagnose anything. It records how you feel and what you do, then compares the two, which is the part memory handles badly.
                </p>

                <ul className="mt-10 space-y-4">
                    {conditions.map((condition) => (
                        <li key={condition.slug}>
                            <Link
                                href={conditionPath(condition)}
                                className="group flex items-start gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 transition-colors hover:border-[var(--color-border-hover)]"
                            >
                                <div className="flex-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{condition.eyebrow}</p>
                                    <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">{condition.name}</h2>
                                    <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">{condition.summary}</p>
                                </div>
                                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>

                <div className="mt-12 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">If your condition is not here</h2>
                    <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                        The log is the same for anything you can describe as a symptom and a habit. Create the fields that match your case and the comparison works the same way.
                    </p>
                    <Link href="/register" className="mt-4 inline-flex items-center gap-2 font-medium text-[var(--color-violet)] hover:underline">
                        Start a log <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
