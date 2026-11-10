// Browser errors. The DSN is public by design; when it is not set the SDK
// stays disabled instead of failing the build.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NODE_ENV,
    // 10% of page loads, enough to see a slow route without paying for all of them.
    tracesSampleRate: 0.1,
    // Keep a replay only when the session ends in an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: dsn ? 1.0 : 0,
    integrations: [
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
});

// Navigation spans: without this export the SDK cannot instrument client-side
// route changes, which is most of this app.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
