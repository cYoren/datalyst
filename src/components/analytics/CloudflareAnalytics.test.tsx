import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

async function component() {
    vi.resetModules();
    return (await import('./CloudflareAnalytics')).CloudflareAnalytics;
}

afterEach(() => vi.unstubAllEnvs());

describe('Cloudflare analytics beacon', () => {
    it('reports to our zone on Datalyst Cloud', async () => {
        vi.stubEnv('NEXT_PUBLIC_DATALYST_SELF_HOSTED', '');
        vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', '');
        const CloudflareAnalytics = await component();
        expect(renderToStaticMarkup(<CloudflareAnalytics />)).toContain('static.cloudflareinsights.com');
    });

    it('sends nothing from a self-hosted install with no token of its own', async () => {
        vi.stubEnv('NEXT_PUBLIC_DATALYST_SELF_HOSTED', '1');
        vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', '');
        const CloudflareAnalytics = await component();
        expect(renderToStaticMarkup(<CloudflareAnalytics />)).toBe('');
    });

    it('lets an operator point it at their own account, or turn it off', async () => {
        vi.stubEnv('NEXT_PUBLIC_DATALYST_SELF_HOSTED', '1');
        vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', 'theirs');
        const CloudflareAnalytics = await component();
        const markup = renderToStaticMarkup(<CloudflareAnalytics />);
        expect(markup).toContain('static.cloudflareinsights.com');
        expect(markup).toContain('theirs');

        vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', 'off');
        expect(renderToStaticMarkup(<CloudflareAnalytics />)).toBe('');
    });
});
