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
  // Machine-readable files AI crawlers read; a login redirect hides them.
  '/ai.txt',
  '/llms.txt',
  '/llms-full.txt',
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
  // The widget log route authenticates with its own device key, so a missing session
  // cookie must not bounce it to /login. Only that one route: /api/widget/token is a
  // session route, and updateSession is what refreshes an expired access token, so
  // exempting the whole prefix would 401 a signed-in user with a stale cookie.
  const isWidgetApi = pathname === '/api/widget/log';
  // The retention route checks its own secret; the cron has no session and would be sent to /login.
  const isCron = pathname === '/api/admin/retention';
  const isAiDirectory = pathname.startsWith('/ai/');
  if (pathname.startsWith('/.well-known/') || publicDiscoveryPaths.has(pathname) || isAiDirectory || isAgentApi || isWidgetApi || isCron) {
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
