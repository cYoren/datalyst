/**
 * Error reporting without values (`ROADMAP.md` S4, `docs/SERVICE_OPERATIONS.md`).
 *
 * Sentry must be able to say *where* something broke, never *what* the person logged. Two layers,
 * because one is never enough:
 *
 * 1. `dataCollection` stops the SDK collecting request bodies, cookies, headers, query strings,
 *    local variable values, database parameters and AI inputs in the first place.
 * 2. `scrubEvent` removes what still arrives: the query string inside `request.url`, every
 *    breadcrumb message (our own `console.error('save failed: ' + note)` calls would otherwise
 *    put a journal note in the breadcrumb), quoted text inside an exception message, and the
 *    stack-frame variables.
 *
 * `beforeSendTransaction` is wired too: `beforeSend` never runs for transaction events, which is
 * where span data lives.
 *
 * What is kept: the exception type, its stack, the route, the release, breadcrumb categories and
 * levels. What cannot be guaranteed: a third-party error message that embeds a value.
 */

/** Breadcrumbs and exception text are the two places a value can still be hiding. */
const REDACTED = '[removed]';

interface ScrubbableEvent {
    request?: {
        data?: unknown;
        cookies?: unknown;
        headers?: Record<string, string>;
        query_string?: unknown;
        url?: string;
        [key: string]: unknown;
    };
    extra?: Record<string, unknown>;
    breadcrumbs?: { data?: Record<string, unknown>; message?: string; category?: string }[];
    user?: { id?: string; email?: string; ip_address?: string; username?: string };
    exception?: { values?: { value?: string; type?: string }[] };
    spans?: { data?: Record<string, unknown> }[];
    contexts?: Record<string, unknown>;
}

/** Headers that identify the request without describing the person. */
const SAFE_HEADERS = new Set(['content-type', 'accept', 'accept-language', 'user-agent', 'host']);

/**
 * Removes quoted text from a message.
 *
 * An error message is useful for its shape ("Unique constraint failed on the fields: (id)") and
 * dangerous for its quotes (`That value "felt awful after the coffee" was edited by hand`).
 */
export function redactQuoted(message: string, minimumRun = 16): string {
    return message.replace(new RegExp(`["'\`][^"'\`]{${minimumRun},}["'\`]`, 'g'), REDACTED);
}

/** Removes the query string from a URL, keeping the path that identifies the route. */
export function pathOnly(url: string): string {
    const index = url.indexOf('?');
    return index === -1 ? url : url.slice(0, index);
}

/** Removes request payloads, cookies, identifying user fields, breadcrumb text and quoted values. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
    if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (typeof event.request.url === 'string') event.request.url = pathOnly(event.request.url);
        if (event.request.headers) {
            const kept: Record<string, string> = {};
            for (const [name, value] of Object.entries(event.request.headers)) {
                if (SAFE_HEADERS.has(name.toLowerCase())) kept[name] = value;
            }
            event.request.headers = kept;
        }
    }

    // No email, no IP, no username: the account id is enough to find the person if it is ever
    // needed, and it is not personal data on its own.
    if (event.user) event.user = event.user.id ? { id: event.user.id } : {};

    if (event.extra) {
        event.extra = Object.fromEntries(Object.keys(event.extra).map((key) => [key, REDACTED]));
    }

    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
            // The category and level say what happened; the message can say what was in it.
            ...crumb,
            message: crumb.message ? REDACTED : undefined,
            data: crumb.data ? Object.fromEntries(Object.keys(crumb.data).map((key) => [key, REDACTED])) : undefined,
        }));
    }

    if (event.exception?.values) {
        event.exception.values = event.exception.values.map((value) => ({
            ...value,
            value: value.value ? redactQuoted(value.value) : value.value,
        }));
        // Frames are rebuilt by the SDK after `beforeSend`, so the variables are dropped here and
        // disabled at collection time (`dataCollection.stackFrameVariables`).
    }

    if (Array.isArray(event.spans)) {
        event.spans = event.spans.map((span) => ({ ...span, data: undefined }));
    }

    if (event.contexts) {
        for (const key of Object.keys(event.contexts)) {
            if (key === 'trace' || key === 'runtime' || key === 'os' || key === 'browser' || key === 'device') continue;
            delete event.contexts[key];
        }
    }

    return event;
}

/**
 * The init shape all three runtimes share, so they cannot drift.
 *
 * `dataCollection` is the SDK's current option (`sendDefaultPii` no longer exists in v11); the
 * scrubbing in `beforeSend` is the second line of defence for anything the SDK still gathers.
 */
export const sentryPrivacyOptions = {
    dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [] as ('incomingRequest' | 'outgoingRequest' | 'incomingResponse' | 'outgoingResponse')[],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
    },
    // The SDK's event type is generic per runtime; this casts to the shape it hands over, scrubs
    // it, and hands the same object back so nothing is dropped or replaced wholesale.
    beforeSend: <T,>(event: T): T => scrubEvent(event as ScrubbableEvent) as unknown as T,
    // `beforeSend` is never called for transactions, and spans carry data of their own.
    beforeSendTransaction: <T,>(event: T): T => scrubEvent(event as ScrubbableEvent) as unknown as T,
};
