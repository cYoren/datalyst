// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
const handle = vi.hoisted(() => vi.fn(async (_req: Request) => new Response('ok')));
vi.mock('@/lib/mcp', () => ({ handleMcpPost: handle }));
import { POST } from './route';

describe('MCP with key in the path', () => {
    it('uses the path key, never a stray Authorization header', async () => {
        const req = new Request('http://x/api/mcp/dl_abc', { method: 'POST', headers: { authorization: 'Bearer other' }, body: '{"jsonrpc":"2.0"}' });
        await POST(req, { params: Promise.resolve({ key: 'dl_abc' }) });
        const forwarded = handle.mock.calls[0][0];
        expect(forwarded.headers.get('x-api-key')).toBe('dl_abc');
        expect(forwarded.headers.get('authorization')).toBeNull();
        expect(await forwarded.text()).toBe('{"jsonrpc":"2.0"}');
    });
});
