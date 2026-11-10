import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ClipboardList, LineChart, ShieldAlert } from 'lucide-react';
import { siteOrigin, withCanonical } from '@/lib/brand';
import { conditionPath, getCondition, listConditions } from '@/lib/conditions';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
    return listConditions().map((condition) => ({ slug: condition.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const condition = getCondition(slug);
    if (!condition) return {};

    return withCanonical(conditionPath(condition), {
        title: `${condition.name} symptom tracker | Datalyst`,
        description: condition.summary,
        keywords: [condition.name, `${condition.short} tracker`, `${condition.short} diary app`, 'symptom tracker', 'habit tracker'],
    });
}

export default async function ConditionPage({ params }: PageProps) {
    const { slug } = await params;
    const condition = getCondition(slug);
    if (!condition) notFound();

    const origin = siteOrigin();
    const url = `${origin}${conditionPath(condition)}`;
    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'MedicalWebPage',
            name: `${condition.name} symptom tracker`,
            description: condition.summary,
            url,
            inLanguage: 'en',
            about: { '@type': 'MedicalCondition', name: condition.name },
            lastReviewed: condition.updated,
        },
        {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: condition.faq.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Datalyst', item: origin },
                { '@type': 'ListItem', position: 2, name: 'Conditions', item: `${origin}/conditions` },
                { '@type': 'ListItem', position: 3, name: condition.short, item: url },
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-[var(--color-bg-subtle)]">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <div className="mx-auto max-w-3xl px-4 py-16">
                <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-text-tertiary)]">
                    <Link href="/" className="hover:underline">Datalyst</Link>
                    <span className="mx-2">/</span>
                    <Link href="/conditions" className="hover:underline">Conditions</Link>
                </nav>

                <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--color-violet)]">{condition.eyebrow}</p>
                <h1 className="mt-3 text-4xl font-bold leading-tight text-[var(--color-text-primary)]">{condition.name}: what to track and why</h1>
                <p className="mt-4 text-xl leading-relaxed text-[var(--color-text-secondary)]">{condition.summary}</p>

                <section className="mt-10 space-y-4">
                    {condition.intro.map((paragraph) => (
                        <p key={paragraph.slice(0, 40)} className="leading-relaxed text-[var(--color-text-secondary)]">{paragraph}</p>
                    ))}
                </section>

                <section className="mt-12">
                    <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text-primary)]">
                        <ClipboardList className="h-6 w-6 text-[var(--color-violet)]" aria-hidden="true" /> What to log
                    </h2>
                    <ul className="mt-5 space-y-3">
                        {condition.log.map((field) => (
                            <li key={field.label} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                                <p className="font-medium text-[var(--color-text-primary)]">{field.label}</p>
                                <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{field.detail}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mt-12">
                    <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text-primary)]">
                        <LineChart className="h-6 w-6 text-[var(--color-violet)]" aria-hidden="true" /> What the charts can show
                    </h2>
                    <ul className="mt-5 space-y-3">
                        {condition.patterns.map((pattern) => (
                            <li key={pattern.slice(0, 40)} className="flex gap-3 leading-relaxed text-[var(--color-text-secondary)]">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-violet)]" />
                                {pattern}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mt-12 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
                    <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-text-primary)]">
                        <ShieldAlert className="h-5 w-5 text-[var(--color-amber)]" aria-hidden="true" /> What it cannot tell you
                    </h2>
                    <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                        {condition.limits.map((limit) => (
                            <li key={limit.slice(0, 40)}>{limit}</li>
                        ))}
                    </ul>
                </section>

                <section className="mt-12">
                    <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">Questions people ask</h2>
                    <div className="mt-5 space-y-4">
                        {condition.faq.map((item) => (
                            <div key={item.q} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
                                <h3 className="font-medium text-[var(--color-text-primary)]">{item.q}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{item.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-12 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Start with today</h2>
                    <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                        One check-in takes under a minute. The first pattern usually shows up after two or three weeks of honest entries, and the record is the thing worth bringing to an appointment.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link href="/register" className="inline-flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]">
                            Create a free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link href="/conditions" className="inline-flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] px-5 py-2.5 font-medium text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)]">
                            Other conditions
                        </Link>
                    </div>
                </section>

                <p className="mt-10 text-xs text-[var(--color-text-tertiary)]">Updated {condition.updated}. Datalyst is a tracker, not a diagnostic tool.</p>
            </div>
        </div>
    );
}
