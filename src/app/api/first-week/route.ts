/**
 * The first-week card for today (`ROADMAP.md` W4).
 *
 * Server-side because it needs the person's whole week, and cheap because it is one query per
 * table. Returns `{ card: null }` on any day that is not one, three or seven, so the screen never
 * has to know the rule.
 */

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { getFirstWeekSource } from '@/services/dashboard.service';
import { returnCardFor, returnCardLines } from '@/lib/return-card';

export async function GET() {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const source = await getFirstWeekSource(user.id);
        const card = returnCardFor(source);
        if (!card) return NextResponse.json({ card: null }, { headers: { 'Cache-Control': 'no-store' } });

        return NextResponse.json(
            {
                card,
                lines: returnCardLines(card, source.main),
                // `ROADMAP.md` W5: offer the reminder at the hour of the check-in that just happened.
                suggestedReminderTime: card.kind === 'day-1' ? source.firstCheckInTime : null,
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Error building the first-week card:', error);
        return NextResponse.json({ card: null }, { status: 500 });
    }
}
