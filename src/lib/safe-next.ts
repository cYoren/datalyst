/**
 * Where to land after signing in: the page that sent us to login, or the dashboard.
 *
 * Only same-site paths are honoured. Without this, `?next=https://elsewhere` would turn the
 * login form into an open redirect, and `?next=/\evil` would too.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
    if (!next) return fallback;
    if (!next.startsWith('/')) return fallback;
    // "//host" and "/\host" are protocol-relative in a browser.
    if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
    return next;
}
