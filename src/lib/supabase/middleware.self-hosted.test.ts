// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function load(env: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DATALYST_SELF_HOSTED', '1');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return (await import('./middleware')).updateSession;
}
const req = (path: string, auth?: string) =>
    new NextRequest(`http://localhost${path}`, auth ? { headers: { authorization: auth } } : undefined);

afterEach(() => vi.unstubAllEnvs());

describe('self-hosted middleware', () => {
    it('lets the local user into the app without login', async () => {
        const updateSession = await load({});
        expect((await updateSession(req('/lab/x'))).status).toBe(200);
    });
    it.each(['/', '/login', '/register'])('sends %s to the dashboard', async path => {
        const updateSession = await load({});
        expect((await updateSession(req(path))).headers.get('location')).toContain('/dashboard');
    });
    it('requires DATALYST_PASSWORD when set', async () => {
        const updateSession = await load({ DATALYST_PASSWORD: 's3cret:x' });
        expect((await updateSession(req('/dashboard'))).status).toBe(401);
        expect((await updateSession(req('/dashboard', 'Basic ' + btoa('me:wrong')))).status).toBe(401);
        expect((await updateSession(req('/dashboard', 'Basic ' + btoa('me:s3cret:x')))).status).toBe(200);
    });
});
