import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';
import { DEMO_PROTOCOLS, generateMockEntries } from '@/lib/demo-data';

/**
 * DELETE /api/demo/setup
 * Archives all protocols for the authenticated user (start fresh).
 */
export async function DELETE() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // By id, not by email: the email can belong to another identity's row.
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id }
        });

        if (!dbUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Delete all entries first (foreign key constraint), then habits
        await prisma.subvariableEntry.deleteMany({
            where: { habitEntry: { userId: dbUser.id } }
        });

        await prisma.habitEntry.deleteMany({
            where: { userId: dbUser.id }
        });

        const deleted = await prisma.habit.deleteMany({
            where: { userId: dbUser.id }
        });

        return NextResponse.json({
            success: true,
            message: `Archived ${deleted.count} trackers`
        });
    } catch (error) {
        console.error('Archive all error:', error);
        return NextResponse.json(
            { error: 'Failed to archive trackers', details: String(error) },
            { status: 500 }
        );
    }
}

/**
 * POST /api/demo/setup
 * Creates the sample trackers and 30 days of entries for the authenticated user,
 * so someone can look around before deciding what to track.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Same identity rule as every other route: never adopt a row by email.
        const dbUser = await ensureUserExists(user.id, user.email!);

        // Never add sample trackers on top of a real account
        const existingHabits = await prisma.habit.count({
            where: { userId: dbUser.id }
        });

        // Sample data is a lens on an empty account, not a second set of trackers
        // mixed into a real one. Say so instead of returning 200 and navigating
        // away with no message (ROADMAP.md T6).
        if (existingHabits > 0) {
            return NextResponse.json(
                {
                    error:
                        'Sample data needs an empty account. You already have trackers, so nothing was added. Open your Dashboard to log today, or use a new account to look around.',
                },
                { status: 409 }
            );
        }

        // Create demo protocols
        const createdProtocols = [];
        for (const protocol of DEMO_PROTOCOLS) {
            const habit = await prisma.habit.create({
                data: {
                    userId: dbUser.id,
                    name: protocol.name,
                    icon: protocol.icon,
                    color: protocol.color,
                    description: protocol.description,
                    scheduleType: protocol.scheduleType,
                    timeBlock: protocol.timeBlock,
                    subvariables: {
                        create: protocol.subvariables.map((sv, idx) => ({
                            name: sv.name,
                            type: sv.type,
                            unit: 'unit' in sv ? (sv.unit ?? null) : null,
                            goalDirection: sv.goalDirection,
                            metadata: JSON.stringify(sv.metadata),
                            order: idx
                        }))
                    }
                },
                include: {
                    subvariables: true
                }
            });
            createdProtocols.push(habit);
        }

        // Generate mock entries
        const mockEntries = generateMockEntries(30);

        // Insert entries
        for (const entry of mockEntries) {
            const protocol = createdProtocols[entry.protocolIdx];
            if (!protocol) continue;

            await prisma.habitEntry.create({
                data: {
                    habitId: protocol.id,
                    userId: dbUser.id,
                    logicalDate: new Date(entry.logicalDate),
                    timestamp: new Date(entry.logicalDate + 'T12:00:00Z'),
                    subvariableEntries: {
                        create: entry.values.map(v => ({
                            subvariableId: protocol.subvariables[v.subvariableIdx].id,
                            numericValue: v.value,
                            rawValue: v.value.toString()
                        }))
                    }
                }
            });
        }

        // Mark onboarding as completed
        await prisma.user.update({
            where: { id: dbUser.id },
            data: { onboardingCompleted: true }
        });

        return NextResponse.json({
            success: true,
            message: 'Demo data created successfully',
            data: {
                protocolsCreated: createdProtocols.length,
                entriesCreated: mockEntries.length
            }
        });

    } catch (error) {
        console.error('Demo setup error:', error);
        return NextResponse.json(
            { error: 'Failed to create demo data', details: String(error) },
            { status: 500 }
        );
    }
}
