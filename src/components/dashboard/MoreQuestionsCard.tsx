'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { moreQuestionsFor } from '@/lib/templates';
import type { Habit } from '@/types';

/**
 * The rest of the pack, after the third day of check-ins (`ROADMAP.md` W1).
 *
 * A new person starts with one question per tracker. Three days in, they have
 * proved the habit of checking in and the pattern has something to compare, so
 * this is when the questions they skipped are worth offering — one tracker, and
 * only the questions that are missing.
 */
export function MoreQuestionsCard({
    habits,
    loggingDays,
}: {
    habits: Habit[];
    loggingDays: number;
}) {
    if (loggingDays < 3) return null;

    const suggestion = moreQuestionsFor(
        habits.map((habit) => ({
            id: habit.id,
            name: habit.name,
            templateOrigin: (habit as { templateOrigin?: string | null }).templateOrigin ?? null,
            subvariables: (habit.subvariables ?? []).map((sub) => ({ name: sub.name })),
        }))
    )[0];

    if (!suggestion) return null;

    const count = suggestion.missing.length;
    return (
        <Link
            href={`/habits/${suggestion.habitId}/edit`}
            className="group flex items-start justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-4 transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">
                    {suggestion.habitName} can say {count === 1 ? 'one more thing' : `${count} more things`}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                    You skipped {suggestion.missing.join(', ')}. Three days in, adding {count === 1 ? 'it' : 'them'} gives the
                    pattern something to compare.
                </span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--color-accent)]" />
        </Link>
    );
}
