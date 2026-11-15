/**
 * Connected apps: what an app may see, write and create (`docs/CONNECTED-APPS.md`).
 *
 * Two rules live here rather than in a route, so the app API and any future path share them:
 * an app key is never an account key, and an app may write only to the trackers it created.
 */

import { ServiceError } from '@/lib/error-utils';

export const APP_SCOPES = ['app:read', 'app:write'] as const;
export type AppScope = (typeof APP_SCOPES)[number];

/** Account-wide scopes an app key must never hold. */
export const ACCOUNT_SCOPES = ['read', 'write', 'research:read', 'research:write'] as const;

export interface ConnectedAppVariable {
    key: string;
    name: string;
    unit?: string;
    type: 'NUMERIC' | 'SCALE_0_10' | 'BOOLEAN' | 'CATEGORY';
    /** True when the value comes from an instrument rather than a self-rating. */
    measured?: boolean;
}

export interface ConnectedAppTracker {
    key: string;
    name: string;
    description?: string;
    icon?: string;
    variables: ConnectedAppVariable[];
}

export interface ConnectedApp {
    id: string;
    name: string;
    description: string;
    redirectUris: string[];
    creates: ConnectedAppTracker[];
    mayRead: 'chosen-variables';
    storeLinks?: { ios?: string; android?: string };
}

/**
 * The registry. Declared in code: no self-service registration in this version.
 */
export const CONNECTED_APPS: ConnectedApp[] = [
    {
        id: 'advanced-dual-n-back',
        name: 'Advanced Dual N-Back',
        description: 'Measures working memory. Reads the context you choose, writes your daily result.',
        redirectUris: ['dualnback://datalyst/callback'],
        creates: [
            {
                key: 'working-memory',
                name: 'Working memory (Advanced Dual N-Back)',
                description: 'Your daily training result, written by the app',
                icon: 'brain',
                variables: [
                    { key: 'dprime', name: 'Sensitivity', unit: 'd′', type: 'NUMERIC', measured: true },
                    { key: 'level', name: 'Level', unit: 'N', type: 'NUMERIC', measured: true },
                    { key: 'span', name: 'Span', unit: 'items', type: 'NUMERIC', measured: true },
                ],
            },
        ],
        mayRead: 'chosen-variables',
        storeLinks: {
            ios: 'https://apps.apple.com/app/id1532686643',
            android: 'https://play.google.com/store/apps/details?id=com.brainworkshop.dualmnback',
        },
    },
];

export function connectedAppById(id: string | null | undefined): ConnectedApp | undefined {
    if (!id) return undefined;
    return CONNECTED_APPS.find((app) => app.id === id);
}

export function isAllowedRedirect(app: ConnectedApp, redirectUri: string): boolean {
    return app.redirectUris.includes(redirectUri);
}

/** An app key holds app scopes only. Anything else is a registry bug, not a runtime choice. */
export function isAppScopesOnly(scopes: readonly string[]): boolean {
    return scopes.every((scope) => (APP_SCOPES as readonly string[]).includes(scope));
}

/** What the connect screen shows the person: what it will write, and what it asks to read. */
export function appSummary(app: ConnectedApp) {
    return {
        id: app.id,
        name: app.name,
        description: app.description,
        writes: app.creates.map((tracker) => ({
            name: tracker.name,
            variables: tracker.variables.map((variable) => ({
                name: variable.name,
                unit: variable.unit ?? null,
                measured: Boolean(variable.measured),
            })),
        })),
        reads: 'The variables you tick, and nothing else' as const,
        storeLinks: app.storeLinks ?? null,
    };
}

export interface WriteTarget {
    id: string;
    createdByAppId: string | null;
    userId: string;
}

/**
 * The one rule for a write by an app key: only a tracker that app created.
 *
 * Called from the service, so a route — or the MCP path later — cannot bypass it.
 * Throws `ServiceError` with the status the route returns as-is.
 */
export function assertAppMayWrite(appId: string, habit: WriteTarget | null | undefined, userId: string) {
    if (!habit || habit.userId !== userId) {
        throw new ServiceError('Tracker not found', 404);
    }
    if (habit.createdByAppId !== appId) {
        throw new ServiceError('This app can only write to the trackers it created', 403);
    }
}

/** A person may always edit their own value, so a manual write is refused on app-owned trackers only for apps. */
export function isWritableBy(appId: string | null, habit: Pick<WriteTarget, 'createdByAppId'>): boolean {
    if (!appId) return true;
    return habit.createdByAppId === appId;
}

/** The display name of a connected app, or null for a tracker nobody else owns. */
export function connectedAppName(appId: string | null | undefined): string | null {
    return connectedAppById(appId)?.name ?? null;
}
