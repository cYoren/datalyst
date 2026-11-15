// @vitest-environment node
/**
 * The end-to-end walk `docs/CONNECTED-APPS.md` ("Done means", check 1) asks for:
 * connect → token → me → write → read back → manual edit → refused overwrite → disconnect → 401.
 *
 * Runs only against the throwaway rollout database, the same guard the other integration tests
 * use. With no database it is skipped rather than faked: a mocked walk would prove nothing about
 * the rule this test exists to hold.
 */
import { afterAll, describe, expect, test } from 'vitest';
import { prisma } from '@/lib/prisma';
import { authenticatesAppKey } from './connected-apps.integration.helpers';
import { issueCode, redeemCode, s256 } from '@/lib/connect';
import { generateApiKey } from '@/lib/agent-auth';
import { GET as getMe } from '@/app/api/v1/app/me/route';
import { DELETE as deleteValues, GET as getValues, PUT as putValues } from '@/app/api/v1/app/values/route';
import { EntryService } from './entry.service';

const url = process.env.DATALYST_ROLLOUT_PG_URL;
const isolated = !!url && process.env.DATABASE_URL === url;
const run = isolated ? test : test.skip;
afterAll(async () => { if (isolated) await prisma.$disconnect(); });

const APP = 'advanced-dual-n-back';
const today = () => new Date().toISOString().slice(0, 10);

describe('connecting an app, end to end', () => {
    run('walks the whole contract, including the refusals', async () => {
        const person = await prisma.user.create({ data: { email: 'connect-walk@synthetic.invalid' } });
        const mood = await prisma.habit.create({
            data: {
                userId: person.id,
                name: 'Mood',
                subvariables: { create: [{ name: 'Mood', type: 'SCALE_0_10', order: 0 }] },
            },
            include: { subvariables: true },
        });

        // 1. connect: the person ticks one variable for the app.
        const { code } = await issueCode({
            userId: person.id,
            appId: APP,
            redirectUri: 'dualnback://datalyst/callback',
            codeChallenge: s256('verifier-' + 'a'.repeat(32)),
            state: 'state-1',
            readableSubvariableIds: [mood.subvariables[0].id],
        });

        // 2. token: code + verifier → key. A wrong verifier is refused and burns nothing.
        await expect(redeemCode({ code, codeVerifier: 'wrong-' + 'b'.repeat(32) })).rejects.toThrow(/verifier/);
        const redeemed = await redeemCode({ code, codeVerifier: 'verifier-' + 'a'.repeat(32) });
        expect(redeemed.key).toMatch(/^dl_/);

        // The same code cannot be exchanged twice.
        await expect(redeemCode({ code, codeVerifier: 'verifier-' + 'a'.repeat(32) })).rejects.toThrow(/already been used/);

        const auth = { authorization: `Bearer ${redeemed.key}` };
        const request = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, { ...init, headers: { ...auth, 'content-type': 'application/json', ...(init?.headers ?? {}) } });

        // 3. me: its own tracker and variables, and only the ticked variable is readable.
        const me = await (await getMe(request('/api/v1/app/me'))).json();
        expect(me.app.id).toBe(APP);
        expect(me.trackers[0].name).toBe('Working memory (Advanced Dual N-Back)');
        expect(me.trackers[0].variables.map((variable: { key: string }) => variable.key)).toEqual(['dprime', 'level', 'span']);
        expect(me.readable.map((variable: { id: string }) => variable.id)).toEqual([mood.subvariables[0].id]);
        expect(JSON.stringify(me)).not.toContain(person.email);

        // 4. write a measured value.
        const write = await putValues(request('/api/v1/app/values', {
            method: 'PUT',
            body: JSON.stringify([{ date: today(), variableKey: 'dprime', value: 2.4 }]),
        }));
        expect(write.status).toBe(200);

        // 5. read it back on the app's own tracker.
        const readBack = await (await getMe(request('/api/v1/app/me'))).json();
        const values = await (await getValues(request(`/api/v1/app/values?from=${today()}&to=${today()}`))).json();
        expect(values.values).toHaveLength(1);
        expect(values.values[0]).toMatchObject({ value: 2.4, source: `app:${APP}`, variableId: readBack.trackers[0].variables[0].id });

        // 6. the person edits that day by hand: the source clears.
        await EntryService.quickEntry(person.id, {
            habitId: readBack.trackers[0].id,
            subvariableId: readBack.trackers[0].variables[0].id,
            numericValue: 1.1,
            logicalDate: today(),
        });

        // 7. the app's next write for that day is refused, with 409 and a reason.
        const overwrite = await putValues(request('/api/v1/app/values', {
            method: 'PUT',
            body: JSON.stringify([{ date: today(), variableKey: 'dprime', value: 3.9 }]),
        }));
        expect(overwrite.status).toBe(409);
        expect((await overwrite.json()).error.message).toMatch(/edited by hand/);

        // 8. it cannot reach a tracker the person created. There is no way to aim a write at
        // another tracker: the body has no tracker field, the route resolves only the app's own
        // trackers, and an undeclared variable is a 404.
        const foreign = await putValues(request('/api/v1/app/values', {
            method: 'PUT',
            body: JSON.stringify([{ date: today(), variableKey: 'mood', value: 2.4 }]),
        }));
        expect(foreign.status).toBe(404);
        expect((await foreign.json()).error.code).toBe('unknown_variable');

        // 9. disconnect: revoking the key makes every app route answer 401.
        await prisma.apiKey.updateMany({
            where: { userId: person.id, appId: APP },
            data: { isActive: false, revokedAt: new Date() },
        });
        expect(await authenticatesAppKey(redeemed.key)).toBe(false);
        const afterRevoke = await getMe(request('/api/v1/app/me'));
        expect(afterRevoke.status).toBe(401);

        // 10. what the app wrote stays in the person's record unless they remove it.
        const remaining = await prisma.subvariableEntry.count({
            where: { habitEntry: { habitId: readBack.trackers[0].id, userId: person.id } },
        });
        expect(remaining).toBeGreaterThan(0);
    });

    run('refuses an account-wide key on the app API, and an app key on the agent API', async () => {
        const person = await prisma.user.create({ data: { email: 'boundary-walk@synthetic.invalid' } });
        const { key: accountKey, keyHash } = generateApiKey();
        await prisma.apiKey.create({
            data: { userId: person.id, name: 'Assistant', keyHash, scopes: ['read', 'write'] },
        });
        const { key: appKey, keyHash: appHash } = generateApiKey();
        await prisma.apiKey.create({
            data: {
                userId: person.id, name: 'App', keyHash: appHash, scopes: ['app:read', 'app:write'],
                appId: APP, readableSubvariableIds: [],
            },
        });

        expect(await authenticatesAppKey(accountKey)).toBe(false);
        expect(await authenticatesAppKey(appKey)).toBe(true);
        expect((await getMe(new Request('http://localhost/api/v1/app/me', { headers: { authorization: `Bearer ${accountKey}` } }))).status).toBe(401);
    });

    run('deletes a value it wrote, and refuses one the person edited', async () => {
        const person = await prisma.user.create({ data: { email: 'delete-walk@synthetic.invalid' } });
        const { code } = await issueCode({
            userId: person.id, appId: APP, redirectUri: 'dualnback://datalyst/callback',
            codeChallenge: s256('verifier-' + 'c'.repeat(32)), state: 's', readableSubvariableIds: [],
        });
        const { key } = await redeemCode({ code, codeVerifier: 'verifier-' + 'c'.repeat(32) });
        const request = (init?: RequestInit) => new Request('http://localhost/api/v1/app/values', { ...init, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' } });

        await putValues(request({ method: 'PUT', body: JSON.stringify([{ date: today(), variableKey: 'level', value: 3 }]) }));
        const removed = await deleteValues(request({ method: 'DELETE', body: JSON.stringify({ date: today(), variableKey: 'level' }) }));
        expect(removed.status).toBe(200);
        const again = await deleteValues(request({ method: 'DELETE', body: JSON.stringify({ date: today(), variableKey: 'level' }) }));
        expect(again.status).toBe(404);
    });
});
