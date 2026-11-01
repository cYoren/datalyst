import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SELF_HOSTED, LOCAL_USER, localAuthClient } from '@/lib/self-hosted'

let localUserReady: Promise<unknown> | null = null
function ensureLocalUser() {
    localUserReady ??= import('@/lib/prisma').then(({ prisma }) => prisma.user.upsert({
        where: { id: LOCAL_USER.id },
        update: {},
        create: { id: LOCAL_USER.id, email: LOCAL_USER.email },
    })).catch((error) => { localUserReady = null; throw error })
    return localUserReady
}

export async function createClient() {
    if (SELF_HOSTED) return localAuthClient(ensureLocalUser) as unknown as ReturnType<typeof createServerClient>
    const cookieStore = await cookies()
    const withCookieDefaults = (options: CookieOptions) => ({
        ...options,
        sameSite: options?.sameSite ?? 'lax',
        secure: process.env.NODE_ENV === 'production',
    })

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, {
                                ...withCookieDefaults(options),
                            })
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}
