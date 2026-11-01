import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SELF_HOSTED } from '@/lib/self-hosted'

export async function updateSession(request: NextRequest) {
    // Proof verification is public and works even when auth credentials are unavailable.
    if (['/verify', '/api/verify'].includes(request.nextUrl.pathname)) return NextResponse.next({ request });
    if (SELF_HOSTED) {
        // Single local user: skip login pages and the marketing homepage.
        const password = process.env.DATALYST_PASSWORD
        if (password) {
            // Optional HTTP Basic auth for servers reachable beyond localhost (any username).
            const [scheme, encoded] = (request.headers.get('authorization') ?? '').split(' ')
            const given = scheme === 'Basic' && encoded ? atob(encoded).split(':').slice(1).join(':') : null
            if (given !== password) {
                return new NextResponse('Password required', {
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Datalyst"' },
                })
            }
        }
        const path = request.nextUrl.pathname
        if (path === '/' || /^\/(login|register|reset-password)(\/|$)/.test(path)) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
        return NextResponse.next({ request })
    }
    const isE2EBypassEnabled = process.env.E2E_BYPASS_AUTH === '1' && request.headers.get('x-e2e-bypass-auth') === '1';
    if (isE2EBypassEnabled) {
        return NextResponse.next({ request });
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    const withCookieDefaults = (options: CookieOptions) => ({
        ...options,
        sameSite: options?.sameSite ?? 'lax',
        secure: process.env.NODE_ENV === 'production',
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, {
                            ...withCookieDefaults(options),
                        })
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/register') ||
        request.nextUrl.pathname.startsWith('/reset-password')

    const isAuthCallback = request.nextUrl.pathname.startsWith('/auth')
    const publicDiscoveryPaths = [
        '/agent.md',
        '/auth.md',
        '/api/openapi.json',
        '/docs/agent-api',
    ]
    const isPublicPage = ['/', '/privacy', '/terms', '/cookies', '/contact', '/manifest.json', '/site.webmanifest', '/sw.js', '/offline.html']
        .includes(request.nextUrl.pathname) || /^\/(?:share|api\/og)\/[^/]+$/.test(request.nextUrl.pathname)
    const isPublicDiscoveryPage = request.nextUrl.pathname.startsWith('/.well-known/') ||
        publicDiscoveryPaths.includes(request.nextUrl.pathname)

    // Protected routes - redirect to login if not authenticated
    if (!user && !isAuthPage && !isAuthCallback && !isPublicPage && !isPublicDiscoveryPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Redirect to dashboard if already logged in and trying to access auth pages
    // or the marketing homepage (the native shells open "/").
    if (user && (isAuthPage || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
