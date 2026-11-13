import { faqJson } from '@/lib/ai-policy';

export function GET() {
    return Response.json(faqJson(), {
        headers: { 'Cache-Control': 'public, max-age=3600' },
    });
}
