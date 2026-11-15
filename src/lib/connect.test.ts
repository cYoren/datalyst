// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'crypto';

const prismaMock = vi.hoisted(() => ({
    connectCode: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    habit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subvariable: { create: vi.fn() },
    apiKey: { create: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
    CODE_TTL_MS,
    hashConnectCode,
    issueCode,
    redeemCode,
    resolveConnectRequest,
    s256,
    verifierMatches,
} from './connect';
import { CONNECTED_APPS } from './connected-apps';

const APP = 'advanced-dual-n-back';
const REDIRECT = 'dualnback://datalyst/callback';
const verifier = randomBytes(32).toString('base64url');
const challenge = s256(verifier);
const state = 'state-123';

const request = (overrides: Partial<Parameters<typeof resolveConnectRequest>[0]> = {}) => ({
    appId: APP,
    redirectUri: REDIRECT,
    codeChallenge: challenge,
    state,
    ...overrides,
});

describe('the connect request', () => {
    it('accepts a registered app, its own redirect URI, a state and an S256 challenge', () => {
        const resolved = resolveConnectRequest(request());
        expect(resolved.app.id).toBe(APP);
        expect(resolved.redirectUri).toBe(REDIRECT);
    });

    it('refuses an unknown app', () => {
        expect(() => resolveConnectRequest(request({ appId: 'not-an-app' }))).toThrow(/not registered/);
        expect(() => resolveConnectRequest(request({ appId: null }))).toThrow(/not registered/);
    });

    it('refuses a redirect URI that is not in the registry', () => {
        expect(() => resolveConnectRequest(request({ redirectUri: 'dualnback://evil/callback' }))).toThrow(/return address/);
        expect(() => resolveConnectRequest(request({ redirectUri: 'https://evil.example/cb' }))).toThrow(/return address/);
        expect(() => resolveConnectRequest(request({ redirectUri: null }))).toThrow(/where to return/);
    });

    it('refuses a missing state and a missing or malformed challenge', () => {
        expect(() => resolveConnectRequest(request({ state: null }))).toThrow(/no state/);
        expect(() => resolveConnectRequest(request({ codeChallenge: null }))).toThrow(/PKCE/);
        expect(() => resolveConnectRequest(request({ codeChallenge: 'short' }))).toThrow(/PKCE/);
        // A verifier and an S256 challenge are both 43 base64url characters, so the issue step
        // cannot tell them apart by shape — that is exactly why PKCE is verified at redemption.
        expect(() => resolveConnectRequest(request({ codeChallenge: verifier }))).not.toThrow();
        expect(() => resolveConnectRequest(request({ codeChallenge: `${challenge}extra` }))).toThrow(/PKCE/);
    });
});

describe('PKCE', () => {
    it('matches only the verifier that hashes to the challenge', () => {
        expect(verifierMatches(challenge, verifier)).toBe(true);
        expect(verifierMatches(challenge, randomBytes(32).toString('base64url'))).toBe(false);
        expect(verifierMatches(challenge, '')).toBe(false);
    });

    it('is the S256 transform, not a truncated verifier', () => {
        expect(s256(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
        expect(challenge).toHaveLength(43);
    });
});

describe('issuing a code', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.connectCode.create.mockResolvedValue({});
    });

    it('stores only a hash, and sends the person back with the code and the state', async () => {
        const { redirectTo, code } = await issueCode({
            userId: 'user-1',
            appId: APP,
            redirectUri: REDIRECT,
            codeChallenge: challenge,
            state,
            readableSubvariableIds: ['var-1'],
        });

        const stored = prismaMock.connectCode.create.mock.calls[0][0].data;
        expect(stored.codeHash).toBe(hashConnectCode(code));
        expect(JSON.stringify(stored)).not.toContain(code);
        expect(stored.readableSubvariableIds).toEqual(['var-1']);
        expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CODE_TTL_MS + 1000);

        expect(redirectTo.startsWith(`${REDIRECT}?code=`)).toBe(true);
        expect(redirectTo).toContain(`state=${state}`);
    });

    it('appends to a URI that already has a query string', async () => {
        const { redirectTo } = await issueCode({
            userId: 'user-1',
            appId: APP,
            redirectUri: 'dualnback://datalyst/callback?x=1',
            codeChallenge: challenge,
            state,
            readableSubvariableIds: [],
        });
        expect(redirectTo).toContain('?x=1&code=');
    });
});

describe('redeeming a code', () => {
    const record = () => ({
        id: 'code-1',
        appId: APP,
        userId: 'user-1',
        redirectUri: REDIRECT,
        codeChallenge: challenge,
        readableSubvariableIds: ['var-1'],
        expiresAt: new Date(Date.now() + 30_000),
        usedAt: null,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.connectCode.findUnique.mockResolvedValue(record());
        prismaMock.connectCode.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.habit.findFirst.mockResolvedValue({
            id: 'tracker-1',
            name: 'Working memory (Advanced Dual N-Back)',
            subvariables: [{ name: 'Sensitivity', type: 'NUMERIC' }, { name: 'Level', type: 'NUMERIC' }],
        });
        prismaMock.apiKey.create.mockResolvedValue({});
    });

    it('mints an app key with a narrowed scope and the ticked variables', async () => {
        const result = await redeemCode({ code: 'dc_abc', codeVerifier: verifier });

        expect(result.key).toMatch(/^dl_/);
        const stored = prismaMock.apiKey.create.mock.calls[0][0].data;
        expect(stored.appId).toBe(APP);
        expect(stored.scopes).toEqual(['app:read', 'app:write']);
        expect(stored.readableSubvariableIds).toEqual(['var-1']);
        // The plaintext key is returned, never stored.
        expect(JSON.stringify(stored)).not.toContain(result.key);
        expect(result.readable).toEqual(['var-1']);
    });

    it('creates the app trackers once, and returns the existing ones on a reconnect', async () => {
        await redeemCode({ code: 'dc_abc', codeVerifier: verifier });
        expect(prismaMock.habit.create).not.toHaveBeenCalled();
        expect(prismaMock.apiKey.create).toHaveBeenCalledTimes(1);
    });

    it('refuses an unknown code, an expired one, a reused one and a wrong verifier', async () => {
        prismaMock.connectCode.findUnique.mockResolvedValueOnce(null);
        await expect(redeemCode({ code: 'dc_nope', codeVerifier: verifier })).rejects.toThrow(/not valid/);

        prismaMock.connectCode.findUnique.mockResolvedValueOnce({ ...record(), expiresAt: new Date(Date.now() - 1) });
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: verifier })).rejects.toThrow(/expired/);

        prismaMock.connectCode.findUnique.mockResolvedValueOnce({ ...record(), usedAt: new Date() });
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: verifier })).rejects.toThrow(/already been used/);

        prismaMock.connectCode.findUnique.mockResolvedValueOnce(record());
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: randomBytes(32).toString('base64url') }))
            .rejects.toThrow(/verifier does not match/);

        // Nothing was written by any of the four refusals.
        expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
        expect(prismaMock.connectCode.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a code that another exchange burned first', async () => {
        prismaMock.connectCode.updateMany.mockResolvedValue({ count: 0 });
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: verifier })).rejects.toThrow(/already been used/);
        expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
    });

    it('refuses a code whose app left the registry', async () => {
        prismaMock.connectCode.findUnique.mockResolvedValue({ ...record(), appId: 'retired-app' });
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: verifier })).rejects.toThrow(/not registered/);
    });

    it('needs both halves of the exchange', async () => {
        await expect(redeemCode({ code: null, codeVerifier: verifier })).rejects.toThrow(/code and a verifier/);
        await expect(redeemCode({ code: 'dc_abc', codeVerifier: null })).rejects.toThrow(/code and a verifier/);
    });
});

describe('the registry the flow depends on', () => {
    it('declares no http(s) redirect, so a code cannot leak to a web page', () => {
        for (const app of CONNECTED_APPS) {
            for (const uri of app.redirectUris) expect(uri).not.toMatch(/^https?:\/\//);
        }
    });
});

describe('reconnecting', () => {
    const person = 'person-1';
    const withChallenge = () => ({
        id: 'code-1',
        codeHash: hashConnectCode('dc_abc'),
        appId: APP,
        userId: person,
        redirectUri: REDIRECT,
        codeChallenge: s256('verifier-' + 'c'.repeat(32)),
        state: 's',
        readableSubvariableIds: [],
        expiresAt: new Date(Date.now() + 30_000),
        usedAt: null,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.connectCode.findUnique.mockResolvedValue(withChallenge());
        prismaMock.connectCode.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.apiKey.create.mockResolvedValue({});
    });

    it('replaces the previous key instead of leaving two live ones', async () => {
        prismaMock.habit.findFirst.mockResolvedValue({ id: 'habit-app', name: 'Working memory', subvariables: [] });

        await redeemCode({ code: 'dc_abc', codeVerifier: 'verifier-' + 'c'.repeat(32) });

        // A revoked old key is not just tidier: the live allowance belongs to the app, and a
        // dead key in Settings would say "connected" while the app uses another.
        expect(prismaMock.apiKey.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ userId: person, appId: APP, isActive: true }),
                data: expect.objectContaining({ isActive: false }),
            }),
        );
    });

    it('matches a renamed tracker by the app key, not by its display name', async () => {
        // The person renamed the tracker; the app key is still what identifies it.
        prismaMock.habit.findFirst.mockResolvedValueOnce({
            id: 'habit-app', name: 'Memory training', appTrackerKey: `app:${APP}:working-memory`,
            subvariables: [{ id: 'sv-1', name: 'Sensitivity', type: 'NUMERIC', metadata: JSON.stringify({ appKey: 'dprime' }) }],
        });

        const result = await redeemCode({ code: 'dc_abc', codeVerifier: 'verifier-' + 'c'.repeat(32) });

        expect(prismaMock.habit.create).not.toHaveBeenCalled();
        expect(result.appTrackers[0]).toMatchObject({ id: 'habit-app', name: 'Memory training' });
        expect(prismaMock.habit.findFirst.mock.calls[0][0].where).toMatchObject({
            createdByAppId: APP, appTrackerKey: `app:${APP}:working-memory`,
        });
    });
});
