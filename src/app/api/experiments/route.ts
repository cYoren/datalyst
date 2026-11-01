import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { experimentFormSchema } from '@/lib/validations';
import { ServiceError } from '@/lib/error-utils';
import { createExperiment, listExperiments } from '@/services/experiment.service';
import type { ExperimentStatus } from '@prisma/client';

/**
 * GET /api/experiments
 * List all experiments for the authenticated user
 * Query params: status (optional filter)
 */
export async function GET(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const experiments = await listExperiments(user.id, status as ExperimentStatus | null);
        return NextResponse.json(experiments);
    } catch (error) {
        console.error('Error fetching experiments:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/experiments
 * Create a new experiment
 */
export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = experimentFormSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        try {
            const experiment = await createExperiment(user.id, validation.data);
            return NextResponse.json(experiment, { status: 201 });
        } catch (error) {
            if (error instanceof ServiceError) {
                return NextResponse.json({ error: error.message }, { status: error.status });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating experiment:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
