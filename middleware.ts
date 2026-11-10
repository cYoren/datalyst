import { NextRequest, NextResponse } from "next/server";
import { updateSession } from '@/lib/supabase/middleware';

const links = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"',
  '</docs/agent-api>; rel="service-doc"; type="text/html"',
  '</auth.md>; rel="describedby"; type="text/markdown"',
].join(", ");

const publicDiscoveryPaths = new Set([
  '/agent.md',
  '/auth.md',
  '/api/openapi.json',
  '/docs/agent-api',
]);

function wantsMarkdown(request: NextRequest) {
  return request.headers
    .get("accept")
    ?.split(",")
    .some((value) => value.trim().split(";", 1)[0] === "text/markdown");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Agent endpoints authenticate with API keys, not the session cookie, so the
  // login redirect must not apply to them.
  const isAgentApi = pathname.startsWith('/api/v1/') || pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');
  // The retention route checks its own secret; the cron has no session and would be sent to /login.
  const isCron = pathname === '/api/admin/retention';
  if (pathname.startsWith('/.well-known/') || publicDiscoveryPaths.has(pathname) || isAgentApi || isCron) {
    return NextResponse.next();
  }

  const isHomepage = pathname === "/";
  const response = isHomepage && wantsMarkdown(request)
    ? NextResponse.rewrite(new URL("/agent.md", request.url))
    : await updateSession(request);

  if (isHomepage) {
    response.headers.set("Link", links);
    response.headers.set("Vary", "Accept");
  }

  return response;
}

export const config = {
  matcher: [
    // sw.js and offline.html must stay outside the auth check. A redirect on the
    // service worker script is a hard registration/update failure per spec, which
    // would pin whatever worker a device already has installed.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|site.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
