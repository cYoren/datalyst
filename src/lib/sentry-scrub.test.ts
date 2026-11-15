import { describe, expect, it } from 'vitest';
import { pathOnly, redactQuoted, scrubEvent, sentryPrivacyOptions } from './sentry-scrub';

/**
 * The contract the runbook states: an error report can say where something broke, never what
 * the person logged. One test per hole the review found.
 */
describe('what an error report may contain', () => {
    it('drops request bodies, cookies and every header but the four that identify a request', () => {
        const event = scrubEvent({
            request: {
                data: { note: 'felt awful after the coffee', numericValue: 8 },
                cookies: { session: 'secret' },
                query_string: 'from=2026-11-01&note=felt+awful',
                headers: { authorization: 'Bearer dl_key', 'content-type': 'application/json', cookie: 'session=secret' },
            },
        });

        expect(event.request?.data).toBeUndefined();
        expect(event.request?.cookies).toBeUndefined();
        expect(event.request?.query_string).toBeUndefined();
        expect(event.request?.headers).toEqual({ 'content-type': 'application/json' });
    });

    it('strips the query string out of request.url, where a note can hide', () => {
        const event = scrubEvent({ request: { url: 'https://datalyst.one/api/entries?note=felt+awful' } });
        expect(event.request?.url).toBe('https://datalyst.one/api/entries');
        expect(pathOnly('https://x/y')).toBe('https://x/y');
    });

    it('removes breadcrumb messages entirely, because our own logs put values in them', () => {
        // `console.error('save failed for note: felt awful', error)` becomes a breadcrumb whose
        // message is the whole string; keeping it would put the note in Sentry.
        const event = scrubEvent({
            breadcrumbs: [
                { category: 'console', message: 'save failed for note: felt awful after the coffee', data: { body: '{"note":"x"}' } },
            ],
        });

        expect(event.breadcrumbs?.[0]).toMatchObject({ category: 'console', message: '[removed]' });
        expect(event.breadcrumbs?.[0].data).toEqual({ body: '[removed]' });
    });

    it('removes quoted text from an exception message and keeps its shape', () => {
        const event = scrubEvent({
            exception: {
                values: [
                    { type: 'ServiceError', value: 'That tracker "Working memory (Advanced Dual N-Back)" was edited by hand' },
                    { type: 'PrismaClientKnownRequestError', value: 'Unique constraint failed on the fields: (`id`)' },
                ],
            },
        });

        expect(event.exception?.values?.[0].value).toBe('That tracker [removed] was edited by hand');
        // A short identifier is not a value and stays: the message is still useful.
        expect(event.exception?.values?.[1].value).toBe('Unique constraint failed on the fields: (`id`)');
    });

    it('keeps the account id and nothing else about the person', () => {
        expect(scrubEvent({ user: { id: 'user-1', email: 'person@example.com', ip_address: '203.0.113.9' } }).user).toEqual({ id: 'user-1' });
        expect(scrubEvent({ user: { email: 'a@b.c' } }).user).toEqual({});
    });

    it('blanks extra values, span data and unfamiliar contexts', () => {
        const event = scrubEvent({
            extra: { habitName: 'Migraine', values: [1, 2, 3] },
            spans: [{ data: { 'db.statement': 'SELECT note FROM HabitEntry' } }],
            contexts: { trace: { trace_id: 'abc' }, habit: { name: 'Migraine' } },
        });

        expect(event.extra).toEqual({ habitName: '[removed]', values: '[removed]' });
        expect(event.spans?.[0].data).toBeUndefined();
        expect(Object.keys(event.contexts ?? {})).toEqual(['trace']);
    });

    it('survives an event with no request, extra, breadcrumbs or user', () => {
        expect(scrubEvent({})).toEqual({});
    });

    it('redacts long quoted runs only, so short identifiers stay readable', () => {
        expect(redactQuoted('value "short" kept')).toBe('value "short" kept');
        expect(redactQuoted('note "a much longer piece of free text here" gone')).toBe('note [removed] gone');
    });
});

describe('the options every runtime shares', () => {
    it('stops the SDK collecting what it would otherwise collect by default', () => {
        const collection = sentryPrivacyOptions.dataCollection;

        expect(collection.userInfo).toBe(false);
        expect(collection.cookies).toBe(false);
        expect(collection.httpHeaders).toEqual({ request: false, response: false });
        expect(collection.httpBodies).toEqual([]);
        expect(collection.urlQueryParams).toBe(false);
        expect(collection.databaseQueryData).toBe(false);
        expect(collection.stackFrameVariables).toBe(false);
        expect(collection.genAI).toEqual({ inputs: false, outputs: false });
        expect(collection.mcp).toEqual({ inputs: false, outputs: false });
    });

    it('scrubs transactions too, because beforeSend is never called for them', () => {
        expect(typeof sentryPrivacyOptions.beforeSendTransaction).toBe('function');
        const scrubbed = sentryPrivacyOptions.beforeSendTransaction({
            spans: [{ data: { note: 'felt awful' } }],
            breadcrumbs: [{ message: 'note: felt awful' }],
        }) as { spans: { data?: unknown }[]; breadcrumbs: { message?: string }[] };

        expect(scrubbed.spans[0].data).toBeUndefined();
        expect(scrubbed.breadcrumbs[0].message).toBe('[removed]');
    });
});
