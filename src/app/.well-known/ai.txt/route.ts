import { aiTxt } from '@/lib/ai-policy';

// The geo-checklist convention: agents look for /.well-known/ai.txt before
// they try /ai.txt.
export function GET() {
    return new Response(aiTxt(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
