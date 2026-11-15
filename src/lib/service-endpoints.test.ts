// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The paths a machine calls with no session: a monitor, a cron, an app's token exchange. Each of
 * them sat behind the login redirect at some point, which is invisible in a route unit test —
 * the handler is never reached, so the test that calls `GET()` directly stays green.
 */

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { middleware } from '../../middleware';
import { updateSession } from './supabase/middleware';

const MACHINE_PATHS = ['/api/health', '/api/connect/token', '/api/admin/retention', '/api/widget/log'];

describe('the outer middleware', () => {
    it.each(MACHINE_PATHS)('lets %s through without a session', async (path) => {
        const response = await middleware(new NextRequest(`http://localhost${path}`, { method: path === '/api/connect/token' ? 'POST' : 'GET' }));
        expect(response.headers.get('location'), path).toBeNull();
    });

    it('still sends an anonymous person from a private page to login', async () => {
        const response = await middleware(new NextRequest('http://localhost/lab'));
        expect([307, 302]).toContain(response.status);
    });
});

describe('the session layer', () => {
    it('lets the health check answer without a session', async () => {
        // Without this, a monitor follows a 307 to /login and reads 200: an outage looks healthy.
        const response = await updateSession(new NextRequest('http://localhost/api/health'));
        expect(response.headers.get('location')).toBeNull();
    });

    it('carries where the person was going into the login redirect', async () => {
        const response = await updateSession(new NextRequest('http://localhost/connect?app=advanced-dual-n-back&state=abc'));
        const location = response.headers.get('location') ?? '';
        expect(location).toContain('/login');
        expect(decodeURIComponent(location)).toContain('next=/connect?app=advanced-dual-n-back&state=abc');
    });

    it('does not turn ?next into an open redirect', async () => {
        const { safeNext } = await import('@/lib/safe-next');
        expect(safeNext('/connect?app=x')).toBe('/connect?app=x');
        for (const hostile of ['https://elsewhere.example', '//elsewhere.example', '/\\elsewhere.example', 'javascript:alert(1)']) {
            expect(safeNext(hostile), hostile).toBe('/dashboard');
        }
    });
});
