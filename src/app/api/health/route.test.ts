// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ answer: true, hang: false }));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRaw: async () => {
            if (db.hang) return new Promise(() => {});
            if (!db.answer) throw new Error('connection refused');
            return [{ '?column?': 1 }];
        },
    },
}));

import { GET } from './route';

describe('GET /api/health', () => {
    it('answers 200 when the database answers, and says nothing about the stack', async () => {
        db.answer = true;
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ ok: true, checks: { database: true } });
        expect(response.headers.get('cache-control')).toBe('no-store');
        // A health endpoint that describes dependencies is an invitation.
        expect(JSON.stringify(body)).not.toMatch(/postgres|prisma|version of|user/i);
    });

    it('answers 503 when the database never answers at all', async () => {
        // A hung connection is the failure a monitor most needs to catch, and it is the one a
        // test that only throws cannot see.
        db.hang = true;
        const pending = GET();
        const response = await Promise.race([
            pending,
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3500)),
        ]);
        db.hang = false;

        expect(response).not.toBe('timeout');
        if (response === 'timeout') throw new Error('the health check never answered');
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ ok: false });
    });

    it('answers 503 when the database refuses', async () => {
        db.answer = false;
        const response = await GET();
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ ok: false, checks: { database: false } });
    });
});
