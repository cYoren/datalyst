import { createBrowserClient, type CookieOptions } from '@supabase/ssr'
import { SELF_HOSTED, localAuthClient } from '@/lib/self-hosted'

export function createClient() {
    if (SELF_HOSTED) return localAuthClient() as unknown as ReturnType<typeof createBrowserClient>
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    const cookie = document.cookie
                        .split('; ')
                        .find(row => row.startsWith(`${name}=`))
                    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null
                },
                set(name: string, value: string, options: CookieOptions) {
                    let cookie = `${name}=${encodeURIComponent(value)}`

                    if (options?.maxAge) {
                        cookie += `; max-age=${options.maxAge}`
                    }
                    if (options?.path) {
                        cookie += `; path=${options.path}`
                    }
                    if (options?.domain) {
                        cookie += `; domain=${options.domain}`
                    }
                    if (process.env.NODE_ENV === 'production') {
                        cookie += '; secure'
                    }
                    const sameSite = options?.sameSite ?? 'lax'
                    cookie += `; samesite=${sameSite}`

                    document.cookie = cookie
                },
                remove(name: string, options: CookieOptions) {
                    let cookie = `${name}=; max-age=0`
                    if (options?.path) {
                        cookie += `; path=${options.path}`
                    }
                    document.cookie = cookie
                }
            }
        }
    )
}
