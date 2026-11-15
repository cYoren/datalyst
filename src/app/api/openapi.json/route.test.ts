// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * The published document has to be a valid OpenAPI 3 object, not a bag of route keys. The app
 * routes were once appended *after* `paths` closed, which every validator rejects while the
 * "connected apps are documented" claim stayed green.
 */
describe('the published OpenAPI document', () => {
    const load = async () => (await GET()).json() as Promise<Record<string, unknown>>;

    it('puts every route inside paths and nothing path-shaped at the root', async () => {
        const spec = await load();

        expect(Object.keys(spec).sort()).toEqual(['components', 'info', 'openapi', 'paths', 'servers', 'tags']);
        expect(Object.keys(spec).filter((key) => key.startsWith('/'))).toEqual([]);

        const paths = Object.keys(spec.paths as Record<string, unknown>);
        expect(paths.length).toBeGreaterThan(5);
        for (const route of paths) expect(route.startsWith('/'), route).toBe(true);
    });

    it('documents both connected-app routes with their refusals', async () => {
        const spec = await load();
        const paths = spec.paths as Record<string, { get?: { tags?: string[]; responses?: Record<string, unknown> }; put?: { responses?: Record<string, unknown> } }>;

        expect(paths['/api/v1/app/me']?.get?.tags).toContain('Connected apps');
        expect(paths['/api/v1/app/values']?.get).toBeDefined();
        // The refusals a client must handle: not an app key, wrong scope, edited by hand.
        expect(Object.keys(paths['/api/v1/app/values']?.put?.responses ?? {})).toEqual(
            expect.arrayContaining(['200', '400', '401', '403', '404', '409', '429']),
        );
    });

    it('declares the API-key and bearer schemes the routes reference', async () => {
        const spec = await load();
        const schemes = (spec.components as { securitySchemes: Record<string, unknown> }).securitySchemes;
        expect(Object.keys(schemes).sort()).toEqual(['ApiKeyAuth', 'BearerAuth']);
    });
});
