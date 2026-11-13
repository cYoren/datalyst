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

export function CloudflareAnalytics() {
  // `||` rather than `??`: an empty value in the build environment must fall back
  // to the zone token instead of silently disabling the beacon.
  const token = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN || DEFAULT_TOKEN;
  if (token === "off") return null;

  return (
    <script
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
