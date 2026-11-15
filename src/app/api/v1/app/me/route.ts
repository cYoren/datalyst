/**
 * `GET /api/v1/app/me` — the app's own trackers and variables, and what it may read.
 *
 * No profile fields at all: an app never learns who the person is (`docs/CONNECTED-APPS.md`).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appError, checkDurableRateLimit, logApiKeyEvent, rateLimited, requireApp, withRateLimitHeaders } from '@/lib/app-api';
import { connectedAppById } from '@/lib/connected-apps';

export async function GET(request: Request) {
    const auth = await requireApp(request, 'app:read');
    if ('response' in auth) return auth.response;
    const { agent } = auth;

    const app = connectedAppById(agent.appId);
    if (!app) return appError(403, 'unknown_app', 'This key belongs to an app that is no longer registered.');

    const rate = await checkDurableRateLimit(agent.apiKeyId, agent.rateLimitPerMinute);
    if (!rate.allowed) return rateLimited(rate);

    const [trackers, readable] = await Promise.all([
        prisma.habit.findMany({
            where: { userId: agent.userId, createdByAppId: agent.appId, archived: false },
            select: {
                id: true,
                name: true,
                archived: true,
                subvariables: {
                    where: { active: true },
                    orderBy: { order: 'asc' },
                    select: { id: true, name: true, unit: true, type: true },
                },
            },
        }),
        prisma.subvariable.findMany({
            where: { id: { in: agent.readableSubvariableIds }, active: true },
            select: {
                id: true,
                name: true,
                unit: true,
                type: true,
                habit: { select: { archived: true } },
            },
        }),
    ]);

    await logApiKeyEvent({ apiKeyId: agent.apiKeyId, appId: agent.appId ?? null, action: 'read' });

    return withRateLimitHeaders(
        NextResponse.json({
            app: { id: app.id, name: app.name },
            // The keys the registry declares, so the app can map its own names to ids.
            trackers: trackers.map((tracker) => ({
                id: tracker.id,
                name: tracker.name,
                variables: tracker.subvariables.map((variable) => ({
                    id: variable.id,
                    name: variable.name,
                    unit: variable.unit,
                    type: variable.type,
                    key:
                        app.creates
                            .flatMap((created) => created.variables)
                            .find((declared) => declared.name === variable.name)?.key ?? null,
                })),
            })),
            // What the person ticked on the connect screen. Empty is a valid answer.
            readable: readable
                .filter((variable) => !variable.habit.archived)
                .map((variable) => ({ id: variable.id, name: variable.name, unit: variable.unit, type: variable.type })),
        }),
        rate,
    );
}
