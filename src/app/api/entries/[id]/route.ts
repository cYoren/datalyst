import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EntryService } from '@/services/entry.service';
import { updateEntrySchema } from '@/lib/validations';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { z } from 'zod';

/**
 * GET /api/entries/[id]
 * Get a single entry by ID
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const entry = await prisma.habitEntry.findUnique({
            where: { id },
            include: {
                habit: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                        color: true,
                        subvariables: {
                            where: { active: true },
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                unit: true,
                                metadata: true,
                                order: true,
                            },
                            orderBy: { order: 'asc' },
                        },
                    },
                },
                subvariableEntries: {
                    include: {
                        subvariable: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                unit: true,
                            },
                        },
                    },
                },
            },
        });

        if (!entry || entry.userId !== user.id) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        return NextResponse.json(entry);
    } catch (error) {
        console.error('Error fetching entry:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * PATCH /api/entries/[id]
 * Update an existing entry
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const json = await request.json();
        const body = updateEntrySchema.parse(json);

        const updatedEntry = await EntryService.updateEntry(user.id, id, body);
        return NextResponse.json(updatedEntry);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (error instanceof Error && error.message.includes('not found')) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error('Error updating entry:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * DELETE /api/entries/[id]
 * Delete an entry
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const entry = await prisma.habitEntry.findUnique({
            where: { id },
        });

        if (!entry || entry.userId !== user.id) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        // Delete entry (cascade will handle subvariable entries)
        await prisma.habitEntry.delete({
            where: { id },
        });

        // Log event
        await prisma.userEvent.create({
            data: {
                userId: user.id,
                eventType: 'ENTRY_DELETED',
                entityId: id,
                metadata: JSON.stringify({ habitId: entry.habitId }),
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting entry:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
