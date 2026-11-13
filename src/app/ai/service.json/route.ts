import { serviceJson } from '@/lib/ai-policy';

export function GET() {
    return Response.json(serviceJson(), {
        headers: { 'Cache-Control': 'public, max-age=3600' },
    });
}
