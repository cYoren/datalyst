// Server-side errors (route handlers, server components) on the Workers
// runtime. `NEXT_PUBLIC_*` is inlined at build time, so it is readable here
// without depending on a runtime binding.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
});
