import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { ServiceError } from '@/lib/error-utils';
import { getExperimentResults } from '@/services/experiment.service';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/experiments/[id]/results
 * Get experiment results: chart data and correlation coefficient
 */
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        return NextResponse.json(await getExperimentResults(user.id, id));
    } catch (error) {
        if (error instanceof ServiceError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('Error fetching experiment results:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
