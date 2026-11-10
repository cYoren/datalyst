import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * Ensure user exists in database
 * Creates user record if it doesn't exist (for users created directly in Supabase)
 *
 * The row is keyed by the Supabase id, and an email that already exists under a
 * different id is never adopted. Email is not proof of identity here: the Supabase
 * project autoconfirms signups, so a new account can claim any unused address
 * without access to its mailbox. An identity can also disappear out of band (an
 * admin, a support request, a dashboard delete) while this row survives. Re-pointing
 * the row in either situation would hand one person's habits, entries and
 * experiments to whoever signs up with that address next.
 */
export async function ensureUserExists(userId: string, email: string) {
    try {
        // Check if user exists by ID
        const existing = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (existing) {
            return existing;
        }

        // A row under this email with another id is an account whose Supabase
        // identity is gone. Quarantine the address so it cannot be adopted, then
        // give the new identity an empty account of its own.
        const orphan = await prisma.user.findUnique({
            where: { email }
        });

        if (orphan) {
            await prisma.user.update({
                where: { id: orphan.id },
                data: { email: `${orphan.id}@orphaned.invalid` }
            });
            console.error('[auth] quarantined an account whose email was claimed by a new identity');
        }

        try {
            return await prisma.user.create({
                data: {
                    id: userId,
                    email: email,
                    onboardingCompleted: false,
                }
            });
        } catch {
            // Another request created it between our read and our write.
            const raced = await prisma.user.findUnique({ where: { id: userId } });
            if (raced) return raced;
            throw new Error('Unable to create the account record');
        }
    } catch (error) {
        console.error('Error ensuring user exists:', error);
        throw error;
    }
}

/**
 * Get authenticated user and ensure they exist in database
 */
export async function getAuthenticatedUser() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
        return null;
    }

    // Ensure user exists in database
    await ensureUserExists(user.id, user.email);

    return user;
}
