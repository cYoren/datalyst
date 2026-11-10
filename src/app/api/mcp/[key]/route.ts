import { handleMcpPost } from '@/lib/mcp';

// Same MCP server, with the API key in the path for clients that only accept a URL
// (ChatGPT connectors, claude.ai custom connectors). The key is revocable in Settings.
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;
    const headers = new Headers(request.headers);
    headers.delete('authorization'); // the key in the path wins
    headers.set('x-api-key', key);
    // Tells the handler the credential arrived in a URL, which lands in request
    // logs, so the key is restricted to read scopes there.
    headers.set('x-api-key-transport', 'path');
    const response = await handleMcpPost(new Request(request.url, { method: 'POST', headers, body: await request.text() }));
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

export function GET() {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const DELETE = GET;
