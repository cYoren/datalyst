import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

/**
 * Get the current authenticated user from Supabase
 * Returns null if not authenticated
 */
export async function getUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Require authentication - redirects to login if not authenticated
 * Returns the authenticated user
 */
export async function requireAuth() {
    const user = await getUser();
    if (!user) {
        redirect('/login');
    }
    return user;
}

/**
 * Check if user has completed onboarding
 * Returns true if completed, false otherwise
 */
export async function checkOnboardingStatus(userId: string): Promise<boolean> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingCompleted: true }
        });
        return user?.onboardingCompleted ?? false;
    } catch (error) {
        console.error('Error checking onboarding status:', error);
        return false;
    }
}

/**
 * Get user profile from database
 */
export async function getUserProfile(userId: string) {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            onboardingCompleted: true,
            timezone: true,
            locale: true,
            theme: true,
            createdAt: true,
        }
    });
}
