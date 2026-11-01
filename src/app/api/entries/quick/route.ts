import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { quickEntrySchema } from '@/lib/validations';
import { EntryService } from '@/services/entry.service';
import { z } from 'zod';
import { ServiceError } from '@/lib/error-utils';

/**
 * POST /api/entries/quick
 * Quick entry endpoint for Today's Log widget
 * Creates or updates a single subvariable entry
 */
export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const json = await request.json();
        const body = quickEntrySchema.parse(json);

        const result = await EntryService.quickEntry(user.id, body);
        if (!result) {
            return NextResponse.json({ error: 'Invalid habit or subvariable' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            entry: result.entry,
            ...(result.warning && { warning: result.warning }),
        }, { status: result.created ? 201 : 200 });
    } catch (error) {
        if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('Error creating quick entry:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
