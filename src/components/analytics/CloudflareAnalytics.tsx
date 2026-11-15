/* eslint-disable @next/next/no-sync-scripts -- the beacon is `type="module"`, which is deferred by definition; the rule only looks for defer/async, and JSX has no comment form that scopes a single element. */
import { SELF_HOSTED } from '@/lib/self-hosted';

/**
 * Cloudflare Web Analytics beacon for datalyst.one.
 *
 * Cloudflare's automatic injection only rewrites HTML served by an origin, so it
 * never reaches pages rendered inside a Worker. This emits the same snippet from
 * the document instead.
 *
 * Set NEXT_PUBLIC_CF_ANALYTICS_TOKEN to override the zone token, or to "off" to
 * turn tracking off for this site.
 */
const DEFAULT_TOKEN = "d69cc2f5c8084ac482d86cb4637f9b2a";

/**
 * The zone token to report to, or null for no beacon at all.
 *
 * A self-hosted install belongs to whoever runs it, so it never reports to us:
 * with no token of its own it renders nothing. Cloud keeps the zone token as a
 * fallback, because an empty value in the build environment must not silently
 * disable analytics for the site we own.
 */
export function analyticsToken(): string | null {
  const configured = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN?.trim();
  if (configured === "off") return null;
  if (configured) return configured;
  return SELF_HOSTED ? null : DEFAULT_TOKEN;
}

export function CloudflareAnalytics() {
  const token = analyticsToken();
  if (!token) return null;

  return (
    <script
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
