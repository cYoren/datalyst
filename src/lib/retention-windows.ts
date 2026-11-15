/**
 * How long we keep things, as plain functions with no database behind them.
 *
 * Shared by the purge job (`src/lib/retention.ts`) and by Settings' inventory, so the page can
 * state the window the job actually keeps. Kept out of `retention.ts` because that module imports
 * the database client, and a client component must never pull that into the browser bundle.
 */

export const parseDays = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const RETENTION_DAYS = {
    sessionLogs: () => parseDays(process.env.RETENTION_SESSION_LOG_DAYS, 90),
    userEvents: () => parseDays(process.env.RETENTION_USER_EVENT_DAYS, 365),
    insights: () => parseDays(process.env.RETENTION_INSIGHTS_DAYS, 30),
} as const;
