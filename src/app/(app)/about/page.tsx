'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Brain, LineChart, Sparkles, FlaskConical, Target, TrendingUp } from 'lucide-react';

export default function AboutPage() {
    return (
        <div className="space-y-10 pb-20 animate-fade-in">
            <header className="space-y-4 text-center max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center p-3 border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)] rounded-[var(--radius-card)] mb-4">
                    <FlaskConical className="h-8 w-8 text-[var(--color-accent)]" suppressHydrationWarning />
                </div>
                <h1 className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">
                    Personal Science Laboratory
                </h1>
                <p className="text-xl text-[var(--text-secondary)] leading-relaxed">
                    Datalyst is your platform for <strong>N=1 experimentation</strong>.
                    Stop guessing what works. Start testing with data.
                </p>
            </header>

            {/* Core Philosophy */}
            <Card className="p-6 bg-[var(--color-bg-card)] border-[var(--color-accent)]/20">
                <div className="flex items-start gap-4">
                    <div className="p-2 rounded-[var(--radius-card)] bg-[var(--color-accent)]/10">
                        <Target className="h-6 w-6 text-[var(--color-accent)]" suppressHydrationWarning />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">The Core Philosophy</h2>
                        <p className="text-[var(--text-secondary)]">
                            Unlike habit trackers that encourage doing the same thing every day,
                            Datalyst encourages <strong>Interventions</strong>: systematically changing variables
                            to discover what actually affects your life. Does &quot;No Coffee&quot; improve your &quot;Sleep Quality&quot;?
                            Stop guessing. Find out.
                        </p>
                    </div>
                </div>
            </Card>

            <div className="grid gap-8 max-w-4xl mx-auto">
                <Card className="p-8 border-l-4 border-l-[var(--color-accent)]">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <FlaskConical className="h-6 w-6 text-[var(--color-accent)]" suppressHydrationWarning />
                        Protocols, Not Habits
                    </h2>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                        We call them <strong>Protocols</strong> because you&apos;re running experiments, not building routines.
                        Each protocol tracks multiple <strong>variables</strong>: inputs you control (caffeine, sleep time, exercise)
                        and outputs you measure (energy, mood, focus). The data reveals which interventions work for <em>you</em>.
                    </p>
                </Card>

                <Card className="p-8 border-l-4 border-l-[var(--color-warning)]">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <LineChart className="h-6 w-6 text-[var(--color-warning)]" suppressHydrationWarning />
                        Correlation Engine
                    </h2>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                        Most apps focus on &quot;keeping the streak&quot;. We focus on <strong>understanding why</strong>.
                        Our algorithms analyze your data to find hidden patterns. You might discover that reading
                        10 pages a day correlates with 20% lower anxiety, or that morning workouts triple your afternoon focus.
                    </p>
                </Card>

                <Card className="p-8 border-l-4 border-l-[var(--color-success)]">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <Brain className="h-6 w-6 text-[var(--color-success)]" suppressHydrationWarning />
                        N=1 Trial Platform
                    </h2>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                        <strong>N=1</strong> means &quot;sample size of one&quot;: you&apos;re the only subject, testing on yourself.
                        This is <em>single-subject experimentation</em>: change one variable, keep others constant,
                        measure outcomes over time. It&apos;s not the same as a large population study, but it reveals
                        what works for <em>your</em> unique biology and lifestyle.
                    </p>
                </Card>

                <Card className="p-8 border-l-4 border-l-[var(--color-violet)]">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <Sparkles className="h-6 w-6 text-[var(--color-violet)]" suppressHydrationWarning />
                        Your Personal Truth
                    </h2>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                        What works for &quot;gurus&quot; might not work for you. We are biologically and psychologically unique.
                        Datalyst helps you build your own <strong>instruction manual</strong>, based on evidence
                        from your own life, not generic advice.
                    </p>
                </Card>
            </div>

            {/* Correlation vs Causation */}
            <Card className="p-6 bg-[var(--color-amber)]/10 border-[var(--color-amber)]/40 ">
                <h3 className="font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    Correlation is not causation
                </h3>
                <p className="text-[var(--text-secondary)] text-sm mb-4">
                    When we show &quot;Caffeine correlates with poor sleep,&quot; it means the pattern exists in your data.
                    But it doesn&apos;t prove caffeine <em>caused</em> the bad sleep. Maybe you drink coffee on stressful days, and stress causes both.
                </p>
                <p className="text-[var(--text-secondary)] text-sm">
                    <strong>To prove causation</strong>, use the Lab to run a controlled experiment: randomize your caffeine intake
                    and see if the effect persists. That&apos;s real science.
                </p>
            </Card>

            {/* Getting Started */}
            <Card className="p-6 bg-[var(--color-bg-subtle)] border-dashed">
                <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[var(--color-accent)]" suppressHydrationWarning />
                    The Full Journey
                </h3>
                <ol className="space-y-3 text-[var(--text-secondary)]">
                    <li className="flex gap-3">
                        <span className="font-bold text-[var(--color-accent)]">1.</span>
                        <span><strong>Create Protocols</strong>: Track what you do (inputs) and how you feel (outputs)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-[var(--color-accent)]">2.</span>
                        <span><strong>Log daily for 14+ days</strong>: Build a dataset for meaningful analysis</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-[var(--color-accent)]">3.</span>
                        <span><strong>Discover correlations</strong>: Dashboard shows patterns in your data automatically</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-[var(--color-accent)]">4.</span>
                        <span><strong>Test in the Lab</strong>: Click any insight to run a controlled experiment</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-[var(--color-accent)]">5.</span>
                        <span><strong>Know what works</strong>: Prove causation with your own data, not generic advice</span>
                    </li>
                </ol>
            </Card>

            <div className="text-center pt-6">
                <p className="text-[var(--text-tertiary)]">
                    &quot;The goal is not to track more. It&apos;s to understand more.&quot;
                </p>
                <p className="text-[var(--text-tertiary)] text-xs mt-4">
                    © {new Date().getFullYear()} Datalyst • CNPJ: 64.661.660/0001-04
                </p>
            </div>
        </div>
    );
}
