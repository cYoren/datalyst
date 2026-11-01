import { handleMcpPost } from '@/lib/mcp';

// Remote MCP server, Streamable HTTP transport in stateless JSON mode.
// Docs: /docs/agent-api#connect-an-agent
export const dynamic = 'force-dynamic';

export const POST = handleMcpPost;

// No server-initiated SSE stream and no sessions, so GET and DELETE are not offered.
export function GET() {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const DELETE = GET;
