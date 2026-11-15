/**
 * Connecting a app (`docs/CONNECTED-APPS.md`, "Connecting").
 *
 * Authorization code with PKCE: the app never sees a key in a URL, the code lives 60 seconds,
 * works once, and is bound to the redirect URI and the S256 challenge it was issued with.
 * Every refusal in this file is one of the four the contract names, plus a missing state.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ServiceError } from '@/lib/error-utils';
import { generateApiKey } from '@/lib/agent-auth';
import { connectedAppById, isAllowedRedirect, type ConnectedApp } from '@/lib/connected-apps';
import { APP_SCOPES } from '@/lib/connected-apps';

export const CODE_TTL_MS = 60_000;
export const CODE_PREFIX = 'dc_';

export function hashConnectCode(code: string): string {
    return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** `base64url(sha256(verifier))`, compared in constant time. */
export function s256(verifier: string): string {
    return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

export function verifierMatches(codeChallenge: string, verifier: string): boolean {
    const expected = Buffer.from(codeChallenge);
    const actual = Buffer.from(s256(verifier));
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
}

export interface ConnectRequest {
    appId: string | null;
    redirectUri: string | null;
    codeChallenge: string | null;
    state: string | null;
}

/** A PKCE challenge is 43 base64url characters for a 32-byte SHA-256 digest. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Validates what an app sent to the connect screen. Throws the reason, in a sentence a person
 * could read, because this is also what the screen shows when a link is broken.
 */
export function resolveConnectRequest(request: ConnectRequest): { app: ConnectedApp; redirectUri: string; codeChallenge: string } {
    const app = connectedAppById(request.appId);
    if (!app) throw new ServiceError('That app is not registered with Datalyst.', 404);

    if (!request.redirectUri) throw new ServiceError('The app did not say where to return you.', 400);
    if (!isAllowedRedirect(app, request.redirectUri)) {
        throw new ServiceError('That return address is not registered for this app.', 400);
    }

    if (!request.state) throw new ServiceError('The app sent no state, so the connection cannot be checked.', 400);
    if (!request.codeChallenge || !CHALLENGE_PATTERN.test(request.codeChallenge)) {
        throw new ServiceError('The app sent no valid PKCE challenge.', 400);
    }

    return { app, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge };
}

/** Issues a one-time code and returns the URL to send the person back to. */
export async function issueCode(input: {
    userId: string;
    appId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    readableSubvariableIds: string[];
}): Promise<{ redirectTo: string; code: string }> {
    const code = CODE_PREFIX + randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await prisma.connectCode.create({
        data: {
            codeHash: hashConnectCode(code),
            appId: input.appId,
            userId: input.userId,
            redirectUri: input.redirectUri,
            codeChallenge: input.codeChallenge,
            readableSubvariableIds: input.readableSubvariableIds,
            expiresAt,
        },
    });

    const separator = input.redirectUri.includes('?') ? '&' : '?';
    const redirectTo = `${input.redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(input.state)}`;
    return { redirectTo, code };
}

/**
 * Redeems a code for a key, creating the app's trackers on first connect.
 *
 * Refusals: unknown or expired code, an already-used code, and a verifier that does not match
 * the challenge. Each writes nothing.
 */
export async function redeemCode(input: { code: string | null; codeVerifier: string | null }) {
    if (!input.code || !input.codeVerifier) {
        throw new ServiceError('The app did not send a code and a verifier.', 400);
    }

    const record = await prisma.connectCode.findUnique({ where: { codeHash: hashConnectCode(input.code) } });
    if (!record) throw new ServiceError('That authorization code is not valid.', 400);
    if (record.usedAt) throw new ServiceError('That authorization code has already been used.', 400);
    if (record.expiresAt.getTime() <= Date.now()) {
        throw new ServiceError('That authorization code expired. Connect again from the app.', 400);
    }
    if (!verifierMatches(record.codeChallenge, input.codeVerifier)) {
        throw new ServiceError('The verifier does not match this authorization code.', 400);
    }

    const app = connectedAppById(record.appId);
    if (!app) throw new ServiceError('That app is not registered with Datalyst.', 404);

    // Burn the code first: two concurrent exchanges must not both mint a key.
    const burned = await prisma.connectCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
    });
    if (burned.count === 0) throw new ServiceError('That authorization code has already been used.', 400);

    const appTrackers = await ensureAppTrackers(record.userId, app);

    // One live key per app: reconnecting replaces the previous one instead of leaving a key
    // nobody holds active — which would eat the account's key allowance and show up in Settings
    // as connected while the app uses a different one.
    await prisma.apiKey.updateMany({
        where: { userId: record.userId, appId: app.id, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
    });

    const { key, keyHash, prefix } = generateApiKey();
    await prisma.apiKey.create({
        data: {
            keyHash,
            prefix,
            name: app.name,
            userId: record.userId,
            scopes: [...APP_SCOPES],
            appId: app.id,
            readableSubvariableIds: record.readableSubvariableIds,
        },
    });

    return {
        key,
        appTrackers: appTrackers.map((tracker) => ({
            id: tracker.id,
            name: tracker.name,
            variables: tracker.variables,
        })),
        readable: record.readableSubvariableIds,
    };
}

/**
 * Creates whatever the app declares and the person does not have yet.
 *
 * Idempotent on purpose: connecting twice, or reconnecting after a revoke, must not give the
 * person a second "Working memory" tracker.
 */
export async function ensureAppTrackers(userId: string, app: ConnectedApp) {
    const created: { id: string; name: string; variables: { name: string; type: string }[] }[] = [];

    for (const tracker of app.creates) {
        // Identity is the app's tracker key stored on the row, never the display name: a person
        // may rename "Working memory" and reconnecting must not create a second one.
        const existing =
            (await prisma.habit.findFirst({
                where: { userId, createdByAppId: app.id, appTrackerKey: appTrackerKey(app.id, tracker.key), archived: false },
                include: { subvariables: { where: { active: true }, orderBy: { order: 'asc' } } },
            }))
            // Rows created before the key was stored have only the name to go on.
            ?? (await prisma.habit.findFirst({
                where: { userId, createdByAppId: app.id, name: tracker.name, archived: false },
                include: { subvariables: { where: { active: true }, orderBy: { order: 'asc' } } },
            }));

        if (existing) {
            // Adopt the key so the next reconnect matches on identity rather than on the name.
            if ((existing as { appTrackerKey?: string | null }).appTrackerKey !== appTrackerKey(app.id, tracker.key)) {
                await prisma.habit.update({ where: { id: existing.id }, data: { appTrackerKey: appTrackerKey(app.id, tracker.key) } });
            }
            // A variable the app added in a later version is created here, not silently missing.
            const missing = tracker.variables.filter((variable) => !existing.subvariables.some((sub) => appKeyOf(sub.metadata) === variable.key || sub.name === variable.name));
            for (const [index, variable] of missing.entries()) {
                await prisma.subvariable.create({
                    data: {
                        habitId: existing.id,
                        name: variable.name,
                        type: variable.type,
                        unit: variable.unit ?? null,
                        order: existing.subvariables.length + index,
                        metadata: JSON.stringify({ measured: Boolean(variable.measured), appKey: variable.key }),
                    },
                });
            }
            created.push({
                id: existing.id,
                name: existing.name,
                variables: existing.subvariables.map((sub) => ({ name: sub.name, type: sub.type })),
            });
            continue;
        }

        const habit = await prisma.habit.create({
            data: {
                userId,
                name: tracker.name,
                description: tracker.description ?? null,
                icon: tracker.icon ?? 'brain',
                createdByAppId: app.id,
                appTrackerKey: appTrackerKey(app.id, tracker.key),
                subvariables: {
                    create: tracker.variables.map((variable, index) => ({
                        name: variable.name,
                        type: variable.type,
                        unit: variable.unit ?? null,
                        order: index,
                        metadata: JSON.stringify({ measured: Boolean(variable.measured), appKey: variable.key }),
                    })),
                },
            },
            include: { subvariables: { where: { active: true }, orderBy: { order: 'asc' } } },
        });

        created.push({
            id: habit.id,
            name: habit.name,
            variables: habit.subvariables.map((sub) => ({ name: sub.name, type: sub.type })),
        });
    }

    return created;
}

/** Reads a variable key back to the tracker it belongs to, for the connect screen and the API. */
export function appVariableKeys(appId: string | undefined) {
    const app = connectedAppById(appId);
    if (!app) return [];
    return app.creates.flatMap((tracker) =>
        tracker.variables.map((variable) => ({ key: variable.key, name: variable.name, trackerName: tracker.name })),
    );
}

/** The stable identity of a tracker an app created, stored on `Habit.templateOrigin`. */
export function appTrackerKey(appId: string, trackerKey: string): string {
    return `app:${appId}:${trackerKey}`;
}

/** The stable identity of one variable, stored in its metadata as `appKey`. */
export function appKeyOf(metadata: string | null | undefined): string | null {
    if (!metadata) return null;
    try {
        const parsed = JSON.parse(metadata) as { appKey?: unknown };
        return typeof parsed.appKey === 'string' ? parsed.appKey : null;
    } catch {
        return null;
    }
}
