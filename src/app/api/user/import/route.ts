import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { importUserData } from '@/services/import.service';

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) {
        return NextResponse.json({ error: 'File too large (50 MB max)' }, { status: 413 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Not a Datalyst export file' }, { status: 400 });
    }

    try {
        const result = await importUserData(user.id, body);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json({ error: 'Not a Datalyst export file' }, { status: 400 });
        }
        console.error('Import failed:', error);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
