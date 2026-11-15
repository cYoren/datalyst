/**
 * `GET /api/health` — the uptime check (`ROADMAP.md` S4).
 *
 * Answers what a monitor needs and nothing else: whether this instance can reach the database,
 * and which build it is. No counts, no user data, no versions of dependencies — a health endpoint
 * that leaks the stack is an invitation.
 *
 * 200 when the database answers within the timeout, 503 when it does not, so every monitor
 * treats a slow database as down rather than as a healthy app.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 2000;

function buildVersion(): string | null {
    const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.CF_PAGES_COMMIT_SHA;
    if (fromEnv) return fromEnv;
    // `CF_VERSION_METADATA` is the Workers binding; it is not in the type environment here.
    const metadata = (globalThis as { __env__?: { CF_VERSION_METADATA?: { id?: string; tag?: string } } }).__env__?.CF_VERSION_METADATA;
    return metadata?.tag ?? metadata?.id ?? null;
}

async function databaseAnswers(): Promise<boolean> {
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), DB_TIMEOUT_MS));
    const query = prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return Promise.race([query, timeout]);
}

export async function GET() {
    const database = await databaseAnswers();
    const body = {
        ok: database,
        checks: { database },
        // Which deployment is answering, so a rollback can be confirmed from a monitor. On
        // Workers the commit comes from the version-metadata binding, which is the only place
        // it exists at runtime.
        version: buildVersion(),
        time: new Date().toISOString(),
    };
    return NextResponse.json(body, {
        status: database ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
    });
}
