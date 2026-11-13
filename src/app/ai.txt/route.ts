import { aiTxt } from '@/lib/ai-policy';

// Same text as /.well-known/ai.txt. Keep [scope] in sync with robots.ts.
export function GET() {
    return new Response(aiTxt(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
