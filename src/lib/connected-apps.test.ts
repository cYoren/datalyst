import { describe, expect, it } from 'vitest';
import {
    ACCOUNT_SCOPES,
    APP_SCOPES,
    CONNECTED_APPS,
    appSummary,
    assertAppMayWrite,
    connectedAppById,
    isAllowedRedirect,
    isAppScopesOnly,
    isWritableBy,
} from './connected-apps';

describe('the connected-app registry', () => {
    it('declares Advanced Dual N-Back with the trackers and measured variables from the contract', () => {
        const app = connectedAppById('advanced-dual-n-back');
        expect(app).toBeDefined();
        expect(app!.creates[0].name).toBe('Working memory (Advanced Dual N-Back)');
        expect(app!.creates[0].variables.map((variable) => variable.key)).toEqual(['dprime', 'level', 'span']);
        expect(app!.creates[0].variables.every((variable) => variable.measured)).toBe(true);
        expect(app!.mayRead).toBe('chosen-variables');
    });

    it('has unique ids, unique tracker keys and at least one redirect URI that is not http', () => {
        const ids = CONNECTED_APPS.map((app) => app.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const app of CONNECTED_APPS) {
            const keys = app.creates.map((tracker) => tracker.key);
            expect(new Set(keys).size, app.id).toBe(keys.length);
            expect(app.redirectUris.length, app.id).toBeGreaterThan(0);
            for (const uri of app.redirectUris) expect(uri, app.id).not.toMatch(/^https?:\/\//);
        }
        expect(connectedAppById('nope')).toBeUndefined();
        expect(connectedAppById(null)).toBeUndefined();
    });

    it('accepts only a registered redirect URI', () => {
        const app = connectedAppById('advanced-dual-n-back')!;
        expect(isAllowedRedirect(app, 'dualnback://datalyst/callback')).toBe(true);
        expect(isAllowedRedirect(app, 'dualnback://evil/callback')).toBe(false);
        expect(isAllowedRedirect(app, 'https://evil.example/callback')).toBe(false);
    });

    it('never grants an account scope to an app key', () => {
        expect(isAppScopesOnly(['app:read', 'app:write'])).toBe(true);
        expect(isAppScopesOnly(['app:read'])).toBe(true);
        expect(isAppScopesOnly(['app:read', 'read'])).toBe(false);
        expect(isAppScopesOnly(['write'])).toBe(false);
        for (const scope of ACCOUNT_SCOPES) expect(APP_SCOPES as readonly string[]).not.toContain(scope);
    });

    it('shows the person what will be written and what may be read, with no profile fields', () => {
        const summary = appSummary(connectedAppById('advanced-dual-n-back')!);
        expect(summary.writes[0].variables.map((variable) => variable.name)).toEqual(['Sensitivity', 'Level', 'Span']);
        expect(summary.reads).toMatch(/you tick/);
        expect(JSON.stringify(summary)).not.toMatch(/email|name of the person/);
    });
});

describe('the write rule', () => {
    const habit = (createdByAppId: string | null) => ({ id: 'h1', userId: 'u1', createdByAppId });

    it('accepts its own tracker', () => {
        expect(() => assertAppMayWrite('app-a', habit('app-a'), 'u1')).not.toThrow();
    });

    it("refuses the person's tracker and another app's", () => {
        expect(() => assertAppMayWrite('app-a', habit(null), 'u1')).toThrow(/only write to the trackers it created/);
        expect(() => assertAppMayWrite('app-a', habit('app-b'), 'u1')).toThrow(/only write to the trackers it created/);
    });

    it("refuses a tracker that is not the caller's at all", () => {
        expect(() => assertAppMayWrite('app-a', { ...habit('app-a'), userId: 'someone-else' }, 'u1')).toThrow(/not found/);
        expect(() => assertAppMayWrite('app-a', null, 'u1')).toThrow(/not found/);
    });

    it('lets the person write anything of their own, app-created or not', () => {
        expect(isWritableBy(null, habit(null))).toBe(true);
        expect(isWritableBy(null, habit('app-a'))).toBe(true);
        expect(isWritableBy('app-a', habit('app-a'))).toBe(true);
        expect(isWritableBy('app-a', habit(null))).toBe(false);
    });
});
