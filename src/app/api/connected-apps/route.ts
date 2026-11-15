/**
 * `GET /api/connected-apps` — Settings → Connected apps.
 *
 * Session only. Returns the registry (what each app would write), whether this account has it
 * connected, what it may read, and the last few things its key did. Activity comes from
 * `ApiKeyEvent`, which records key, app, action, tracker and day — never a value.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { CONNECTED_APPS } from '@/lib/connected-apps';

const RECENT_EVENTS = 10;

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const keys = await prisma.apiKey.findMany({
        where: { userId: user.id, isActive: true, revokedAt: null, appId: { not: null } },
        select: {
            id: true,
            appId: true,
            readableSubvariableIds: true,
            lastUsedAt: true,
            createdAt: true,
            events: {
                orderBy: { createdAt: 'desc' },
                take: RECENT_EVENTS,
                select: { action: true, habitId: true, logicalDate: true, createdAt: true },
            },
        },
    });

    const readableNames = new Map(
        (
            await prisma.subvariable.findMany({
                where: { id: { in: keys.flatMap((key) => key.readableSubvariableIds) } },
                select: { id: true, name: true, habit: { select: { name: true } } },
            })
        ).map((variable) => [variable.id, `${variable.habit.name} (${variable.name})`]),
    );

    const trackerNames = new Map(
        (
            await prisma.habit.findMany({
                where: { userId: user.id },
                select: { id: true, name: true },
            })
        ).map((habit) => [habit.id, habit.name]),
    );

    return NextResponse.json({
        apps: CONNECTED_APPS.map((app) => {
            const key = keys.find((candidate) => candidate.appId === app.id);
            return {
                id: app.id,
                name: app.name,
                description: app.description,
                storeLinks: app.storeLinks ?? null,
                writes: app.creates.map((tracker) => ({
                    name: tracker.name,
                    variables: tracker.variables.map((variable) => variable.name),
                })),
                connection: key
                    ? {
                        keyId: key.id,
                        connectedAt: key.createdAt,
                        lastUsedAt: key.lastUsedAt,
                        readable: key.readableSubvariableIds.map((id) => readableNames.get(id) ?? 'Removed variable'),
                        events: key.events.map((event) => ({
                            action: event.action,
                            tracker: event.habitId ? trackerNames.get(event.habitId) ?? null : null,
                            date: event.logicalDate ? event.logicalDate.toISOString().slice(0, 10) : null,
                            at: event.createdAt,
                        })),
                    }
                    : null,
            };
        }),
    });
}
