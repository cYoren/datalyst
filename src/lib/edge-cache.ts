// Prerendered public pages. Everything else (and anyone with a session) goes straight to the app.
const PUBLIC_PAGES = new Set(["/", "/privacy", "/terms", "/cookies", "/contact", "/login", "/register"]);

export function edgeCacheable(request: Request): boolean {
  const { pathname, searchParams } = new URL(request.url);
  const h = request.headers;
  return request.method === "GET"
    && PUBLIC_PAGES.has(pathname)
    && !searchParams.has("_rsc")
    && !h.has("rsc")
    && !h.has("next-router-state-tree")
    && !h.has("authorization")
    // Logged-in users get redirected from these pages by the middleware.
    && !/(^|;\s*)sb-/.test(h.get("cookie") ?? "")
    // "/" answers text/markdown with agent.md.
    && !(h.get("accept") ?? "").includes("text/markdown");
}

// Keyed by Worker version: a deploy can never serve HTML pointing at chunks from the old build.
export function edgeCacheKey(request: Request, version: string): Request {
  const { origin, pathname } = new URL(request.url);
  return new Request(`${origin}${pathname}?edge-version=${encodeURIComponent(version)}`);
}
