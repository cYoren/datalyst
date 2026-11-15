'use client';

import React from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/Card';
import { fetcher } from '@/lib/hooks';
import { ReminderControl, useRemindersAvailable } from '@/components/ui/ReminderControl';
import type { ReturnCard } from '@/lib/return-card';

/**
 * Something back on days one, three and seven (`ROADMAP.md` W4).
 *
 * The copy comes from the server (`returnCardLines`), so it is written once and tested there.
 * Nothing here claims a pattern: on day seven the person gets a description of their week with
 * the number of days behind it.
 */
export function FirstWeekCard() {
    const remindersAvailable = useRemindersAvailable();
    const { data } = useSWR<{
        card: ReturnCard | null;
        lines?: { title: string; body: string[] };
        suggestedReminderTime?: string | null;
    }>(
        '/api/first-week',
        fetcher,
        { revalidateOnFocus: false },
    );

    if (!data?.card || !data.lines) return null;

    return (
        <Card className="p-5 space-y-3 paper-lift" data-testid="first-week-card" data-kind={data.card.kind}>
            <h2 className="text-base font-semibold font-display text-[var(--text-primary)]">{data.lines.title}</h2>
            <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                {data.lines.body.map((line, index) => (
                    <li key={index}>{line}</li>
                ))}
            </ul>
            {/* Only offered where a reminder can exist: on the web the control renders nothing,
                and promising one the person cannot see is worse than saying nothing. */}
            {data.card.kind === 'day-1' && remindersAvailable && (
                <div className="pt-1">
                    <p className="mb-2 text-xs text-[var(--text-tertiary)]">
                        One reminder a day, at the hour you checked in — that is the one you will keep.
                    </p>
                    <ReminderControl suggestedTime={data.suggestedReminderTime ?? undefined} />
                </div>
            )}
        </Card>
    );
}
