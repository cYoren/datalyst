// Wraps the OpenNext worker: edge cache for public pages, native shell CORS, and the cron job vercel.json used to run.
import handler from "./.open-next/worker.js";
import { edgeCacheable, edgeCacheKey } from "./src/lib/edge-cache";

type Ctx = { waitUntil(promise: Promise<unknown>): void };
type Env = { CF_VERSION_METADATA: { id: string } };

async function fetchWithEdgeCache(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  if (!edgeCacheable(request)) return handler.fetch(request, env, ctx);
  const cache = (caches as unknown as { default: Cache }).default;
  const key = edgeCacheKey(request, env.CF_VERSION_METADATA.id);
  const hit = await cache.match(key);
  if (hit) {
    // The stored copy carries the edge lifetime; browsers get the page's own header back.
    const out = new Response(hit.body, hit);
    out.headers.set("cache-control", hit.headers.get("x-origin-cache-control") ?? "private, no-cache");
    out.headers.delete("x-origin-cache-control");
    out.headers.set("x-edge-cache", "HIT");
    return out;
  }
  const response: Response = await handler.fetch(request, env, ctx);
  if (response.status === 200 && !response.headers.has("set-cookie")) {
    const copy = new Response(response.clone().body, response);
    copy.headers.set("x-origin-cache-control", response.headers.get("cache-control") ?? "private, no-cache");
    copy.headers.set("cache-control", "public, max-age=86400");
    ctx.waitUntil(cache.put(key, copy));
  }
  return response;
}

// Shipped native apps check these from a local origin before opening the site (www/index.html).
// Without this header the check fails and they show "not reachable". The check sends no cookies.
const NATIVE_SHELL_CHECK = new Set(["/", "/dashboard", "/login"]);

async function fetchWithShellCors(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  // Some WebViews preflight the check (cache: "no-store" adds cache headers); answer it directly.
  if (request.method === "OPTIONS" && NATIVE_SHELL_CHECK.has(new URL(request.url).pathname)) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "*",
        "access-control-max-age": "86400",
      },
    });
  }
  const response = await fetchWithEdgeCache(request, env, ctx);
  if (request.method !== "GET" || !NATIVE_SHELL_CHECK.has(new URL(request.url).pathname)) return response;
  const out = new Response(response.body, response);
  out.headers.set("access-control-allow-origin", "*");
  return out;
}

export default {
  fetch: fetchWithShellCors,
  async scheduled(_event: unknown, env: { RETENTION_TASK_SECRET?: string }, ctx: Ctx) {
    const request = new Request("https://www.datalyst.one/api/admin/retention", {
      headers: { authorization: `Bearer ${env.RETENTION_TASK_SECRET}` },
    });
    const response: Response = await handler.fetch(request, env, ctx);
    console.log(`retention cron: ${response.status} ${(await response.text()).slice(0, 500)}`);
    if (!response.ok) throw new Error(`retention cron failed with ${response.status}`);
  },
};
