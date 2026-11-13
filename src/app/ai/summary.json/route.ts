import { summaryJson } from '@/lib/ai-policy';

export function GET() {
    return Response.json(summaryJson(), {
        headers: { 'Cache-Control': 'public, max-age=3600' },
    });
}
