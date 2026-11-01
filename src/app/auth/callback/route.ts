import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'

            // Get user to check onboarding status
            const { data: { user } } = await supabase.auth.getUser()

            let redirectPath = next

            if (user) {
                try {
                    // Extract name from metadata
                    const name = user.user_metadata?.name || user.user_metadata?.full_name;

                    // Upsert user profile to ensure it exists and has the name
                    const userProfile = await prisma.user.upsert({
                        where: { id: user.id },
                        update: {
                            // Only update name if it's currently null/empty and we have a new one
                            ...(name && { name })
                        },
                        create: {
                            id: user.id,
                            email: user.email!,
                            name: name || null,
                            onboardingCompleted: false
                        },
                        select: { onboardingCompleted: true }
                    });

                    // Redirect to onboarding if not completed
                    if (!userProfile.onboardingCompleted) {
                        redirectPath = '/onboarding'
                    }
                } catch (error) {
                    console.error('Error checking/creating user profile:', error)
                }
            }

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${redirectPath}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
            } else {
                return NextResponse.redirect(`${origin}${redirectPath}`)
            }
        }
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}

