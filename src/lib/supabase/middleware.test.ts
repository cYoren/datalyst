// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
import { updateSession } from './middleware';
describe('public crawler files', () => {
    it.each(['/sitemap.xml', '/robots.txt', '/opengraph-image', '/twitter-image'])('serves %s without sending anonymous visitors to login', async path => {
        const response = await updateSession(new NextRequest(`http://localhost${path}`));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });
});

describe('anonymous shared results routing', () => {
    it.each(['/share/synthetic-slug', '/api/og/synthetic-slug'])('allows %s through to its public-data authorization', async path => {
        const response = await updateSession(new NextRequest(`http://localhost${path}`));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });
    it.each(['/lab/synthetic', '/api/experiments/synthetic/sharing', '/share/synthetic/extra', '/api/og/synthetic/extra'])('keeps %s authenticated', async path => {
        const response = await updateSession(new NextRequest(`http://localhost${path}`));
        expect(response.headers.get('location')).toContain('/login');
    });
});
