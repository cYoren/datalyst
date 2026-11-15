/**
 * `GET|PUT|DELETE /api/v1/app/values` — the day values an app may read, and the ones it owns.
 *
 * Rules from `docs/CONNECTED-APPS.md` that live here:
 * - one value per variable per day, the day always sent by the app;
 * - a write is refused for anything but the app's own trackers (the service enforces it);
 * - a write is refused for a day the person edited by hand (409, from the service);
 * - writes more than 30 days back or in the future are refused;
 * - a missing day is absent, never zero.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ServiceError } from '@/lib/error-utils';
import { EntryService } from '@/services/entry.service';
import {
    MAX_RANGE_DAYS,
    MAX_WRITE_DAYS_BACK,
    MAX_WRITES_PER_REQUEST,
    appError,
    checkDurableRateLimit,
    daysBetween,
    isCalendarDate,
    logApiKeyEvent,
    rateLimited,
    requireApp,
    validateValue,
    withRateLimitHeaders,
} from '@/lib/app-api';
import { connectedAppById } from '@/lib/connected-apps';
import { dayKeyUtc, isLogicalDay, isLogicalRange, localDayIn, logicalDayWindow, logicalRangeWindow, shiftDay } from '@/lib/logical-day';
import { accountTimeZone } from '@/lib/account-time-zone';

/** The registry's variable keys, and the tracker names they live in. */
function declaredVariables(appId: string | undefined) {
    const app = connectedAppById(appId);
    if (!app) return [];
    return app.creates.flatMap((tracker) =>
        tracker.variables.map((variable) => ({
            key: variable.key,
            name: variable.name,
            trackerName: tracker.name,
        })),
    );
}

export async function GET(request: Request) {
    const auth = await requireApp(request, 'app:read');
    if ('response' in auth) return auth.response;
    const { agent } = auth;

    const rate = await checkDurableRateLimit(agent.apiKeyId, agent.rateLimitPerMinute);
    if (!rate.allowed) return rateLimited(rate);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!isCalendarDate(from) || !isCalendarDate(to)) {
        return appError(400, 'invalid_range', 'Send from and to as YYYY-MM-DD.');
    }
    if (daysBetween(from, to) < 1) {
        return appError(400, 'invalid_range', 'The end of the range comes before the start.');
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
        return appError(400, 'range_too_long', `Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
    }

    // What the app may read back: the variables the person ticked, plus the variables of the
    // trackers the app created itself. Without the second half an app could never verify what it
    // wrote or notice that a day was edited by hand, which is the whole resync contract
    // (`docs/CONNECTED-APPS.md`, "Done means" check 1: write, then read it back).
    const own = agent.appId
        ? await prisma.habit.findMany({
            where: { userId: agent.userId, createdByAppId: agent.appId },
            select: { subvariables: { select: { id: true } } },
        })
        : [];
    const readable = [...new Set([
        ...agent.readableSubvariableIds,
        ...own.flatMap((habit) => habit.subvariables.map((variable) => variable.id)),
    ])];

    if (readable.length === 0) {
        await logApiKeyEvent({ apiKeyId: agent.apiKeyId, appId: agent.appId ?? null, action: 'read' });
        return withRateLimitHeaders(NextResponse.json({ values: [] }), rate);
    }

    const range = logicalRangeWindow(from, to);
    const entries = await prisma.subvariableEntry.findMany({
        where: {
            subvariableId: { in: readable },
            habitEntry: {
                userId: agent.userId,
                logicalDate: { gte: range.gte, lt: range.lt },
            },
        },
        select: {
            subvariableId: true,
            numericValue: true,
            habitEntry: { select: { logicalDate: true, source: true } },
        },
        orderBy: { habitEntry: { logicalDate: 'asc' } },
    });

    await logApiKeyEvent({ apiKeyId: agent.apiKeyId, appId: agent.appId ?? null, action: 'read' });

    return withRateLimitHeaders(
        NextResponse.json({
            // The wide window over-selects by up to a day either side; the day filter is what
            // makes the answer exact, and it reads a legacy local-midnight row correctly too.
            values: entries.filter((entry) => isLogicalRange(entry.habitEntry.logicalDate, from, to)).map((entry) => ({
                date: dayKeyUtc(entry.habitEntry.logicalDate),
                variableId: entry.subvariableId,
                value: entry.numericValue,
                source: entry.habitEntry.source ?? 'manual',
            })),
        }),
        rate,
    );
}

interface WriteItem {
    date: string;
    variableKey: string;
    value: number;
}

function parseWriteBody(body: unknown): WriteItem[] | { error: string } {
    const list = Array.isArray(body)
        ? body
        : typeof body === 'object' && body !== null && Array.isArray((body as { values?: unknown }).values)
            ? (body as { values: unknown[] }).values
            : null;

    if (!list) return { error: 'Send an array of { date, variableKey, value }.' };
    if (list.length === 0) return { error: 'Send at least one value.' };
    if (list.length > MAX_WRITES_PER_REQUEST) return { error: `Send at most ${MAX_WRITES_PER_REQUEST} values at a time.` };

    const items: WriteItem[] = [];
    for (const raw of list) {
        const item = raw as Partial<WriteItem> | null;
        if (!item || typeof item.variableKey !== 'string' || typeof item.value !== 'number') {
            return { error: 'Each value needs variableKey (text) and value (number).' };
        }
        if (!isCalendarDate(item.date)) return { error: 'Each value needs date as YYYY-MM-DD.' };
        items.push({ date: item.date, variableKey: item.variableKey, value: item.value });
    }
    return items;
}

export async function PUT(request: Request) {
    const auth = await requireApp(request, 'app:write');
    if ('response' in auth) return auth.response;
    const { agent } = auth;

    const rate = await checkDurableRateLimit(agent.apiKeyId, agent.rateLimitPerMinute);
    if (!rate.allowed) return rateLimited(rate);

    const body = await request.json().catch(() => null);
    const parsed = parseWriteBody(body);
    if (!Array.isArray(parsed)) return appError(400, 'invalid_body', parsed.error);

    const declared = declaredVariables(agent.appId);
    if (declared.length === 0) {
        return appError(403, 'unknown_app', 'This key belongs to an app that is no longer registered.');
    }

    // The ceiling is the person's own calendar day, not UTC's: at 09:00 in Sydney the UTC day
    // is still yesterday, and their today must be writable.
    const timeZone = await accountTimeZone(agent.userId);
    const today = localDayIn(timeZone);
    const earliest = shiftDay(today, -MAX_WRITE_DAYS_BACK);
    for (const item of parsed) {
        if (item.date < earliest || item.date > today) {
            return appError(400, 'date_out_of_range', `Write dates between ${earliest} and ${today}.`);
        }
        if (!declared.some((variable) => variable.key === item.variableKey)) {
            return appError(404, 'unknown_variable', `This app has no variable called "${item.variableKey}".`);
        }
    }

    // Resolve the registry's keys to this account's own trackers and variables.
    const trackers = await prisma.habit.findMany({
        where: { userId: agent.userId, createdByAppId: agent.appId, archived: false },
        select: { id: true, name: true, subvariables: { where: { active: true }, select: { id: true, name: true, type: true, metadata: true } } },
    });

    const written: { date: string; variableKey: string; variableId: string }[] = [];
    const refused: { date: string; variableKey: string; reason: string }[] = [];

    for (const item of parsed) {
        const declaration = declared.find((variable) => variable.key === item.variableKey)!;
        const tracker = trackers.find((candidate) => candidate.name === declaration.trackerName);
        const variable = tracker?.subvariables.find((candidate) => candidate.name === declaration.name);
        if (!tracker || !variable) {
            return appError(404, 'unknown_variable', 'That variable is not on this account yet; reconnect the app.');
        }

        const invalid = validateValue(variable.type, item.value, variable.metadata);
        if (invalid) return appError(400, 'invalid_value', invalid);

        let result: Awaited<ReturnType<typeof EntryService.quickEntry>>;
        try {
            result = await EntryService.quickEntry(
                agent.userId,
                {
                    habitId: tracker.id,
                    subvariableId: variable.id,
                    numericValue: item.value,
                    logicalDate: item.date,
                },
                { appId: agent.appId! },
            );
        } catch (error) {
            // A value the person edited by hand refuses only that value: the rest of the batch
            // is still written, so one manual fix does not stop the whole sync.
            if (error instanceof ServiceError && error.status === 409) {
                refused.push({ date: item.date, variableKey: item.variableKey, reason: 'hand_edited' });
                continue;
            }
            if (error instanceof ServiceError) return appError(error.status, 'write_refused', error.message);
            throw error;
        }
        if (!result) {
            return appError(404, 'unknown_variable', 'That variable is not on this account yet; reconnect the app.');
        }

        await logApiKeyEvent({
            apiKeyId: agent.apiKeyId,
            appId: agent.appId ?? null,
            action: 'write',
            habitId: tracker.id,
            logicalDate: new Date(`${item.date}T00:00:00Z`),
        });
        written.push({ date: item.date, variableKey: item.variableKey, variableId: variable.id });
    }

    // The status describes the batch, not the first item: one hand-edited value must not stop the
    // rest of a sync, and a client that sent one item must not read refusals as success
    // (`docs/CONNECTED-APPS.md`, "Done means" check 1).
    if (written.length === 0 && refused.length > 0) {
        const response = appError(409, 'hand_edited', 'This value was edited by hand, so it is no longer updated by the app.');
        return withRateLimitHeaders(response, rate);
    }

    return withRateLimitHeaders(NextResponse.json({ written, refused }), rate);
}

export async function DELETE(request: Request) {
    const auth = await requireApp(request, 'app:write');
    if ('response' in auth) return auth.response;
    const { agent } = auth;

    const rate = await checkDurableRateLimit(agent.apiKeyId, agent.rateLimitPerMinute);
    if (!rate.allowed) return rateLimited(rate);

    const body = await request.json().catch(() => null) as Partial<WriteItem> | null;
    if (!body || !isCalendarDate(body.date) || typeof body.variableKey !== 'string') {
        return appError(400, 'invalid_body', 'Send { date, variableKey }.');
    }

    const declaration = declaredVariables(agent.appId).find((variable) => variable.key === body.variableKey);
    if (!declaration) {
        return appError(404, 'unknown_variable', `This app has no variable called "${body.variableKey}".`);
    }

    const tracker = await prisma.habit.findFirst({
        where: { userId: agent.userId, createdByAppId: agent.appId, name: declaration.trackerName, archived: false },
        select: { id: true, subvariables: { where: { active: true, name: declaration.name }, select: { id: true } } },
    });
    const variableId = tracker?.subvariables[0]?.id;
    if (!tracker || !variableId) {
        return appError(404, 'unknown_variable', 'That variable is not on this account yet; reconnect the app.');
    }

    const day = body.date;
    const dayWindow = logicalDayWindow(day);
    const candidates = await prisma.habitEntry.findMany({
        where: {
            habitId: tracker.id,
            userId: agent.userId,
            logicalDate: { gte: dayWindow.gte, lt: dayWindow.lt },
        },
        select: { id: true, source: true, logicalDate: true, subvariableEntries: { where: { subvariableId: variableId }, select: { id: true } } },
    });
    const entry = candidates.find((candidate) => isLogicalDay(candidate.logicalDate, day) && candidate.subvariableEntries.length > 0);

    if (!entry || entry.subvariableEntries.length === 0) {
        return appError(404, 'not_found', 'There is no value to remove for that day.');
    }
    if (entry.source !== `app:${agent.appId}`) {
        return appError(409, 'not_app_value', 'That day was edited by hand, so the app cannot remove it.');
    }

    await prisma.subvariableEntry.delete({ where: { id: entry.subvariableEntries[0].id } });

    await logApiKeyEvent({
        apiKeyId: agent.apiKeyId,
        appId: agent.appId ?? null,
        action: 'delete',
        habitId: tracker.id,
        logicalDate: new Date(`${body.date}T00:00:00Z`),
    });

    return withRateLimitHeaders(NextResponse.json({ deleted: { date: body.date, variableKey: body.variableKey } }), rate);
}
