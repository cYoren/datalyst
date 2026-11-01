import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureUserExists } from '@/lib/ensure-user';
import { prisma } from '@/lib/prisma';
import { deleteAccountRecords } from '@/services/account.service';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user || !user.email) {
            return NextResponse.json({ error: 'Unauthorized', details: error?.message }, { status: 401 });
        }

        await ensureUserExists(user.id, user.email);

        // Get user profile from database
        const profile = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                email: true,
                name: true,
                onboardingCompleted: true,
                timezone: true,
                locale: true,
                theme: true,
                healthDataConsent: true,
                healthDataConsentAt: true,
                createdAt: true,
            }
        });

        return NextResponse.json({
            id: user.id,
            email: user.email,
            name: profile?.name || user.user_metadata?.name || null,
            profile: profile || null,
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { onboardingCompleted, timezone, locale, theme, name, healthDataConsent } = body;
        const normalizedName = typeof name === 'string' ? name.trim() : undefined;
        const shouldUpdateConsent = typeof healthDataConsent === 'boolean';

        // Update user profile in database
        const updatedProfile = await prisma.user.update({
            where: { id: user.id },
            data: {
                ...(typeof onboardingCompleted === 'boolean' && { onboardingCompleted }),
                ...(timezone && { timezone }),
                ...(locale && { locale }),
                ...(theme && { theme }),
                ...(typeof normalizedName === 'string' && { name: normalizedName || null }),
                ...(shouldUpdateConsent && {
                    healthDataConsent,
                    healthDataConsentAt: healthDataConsent ? new Date() : null,
                }),
            },
            select: {
                id: true,
                email: true,
                name: true,
                onboardingCompleted: true,
                timezone: true,
                locale: true,
                theme: true,
                healthDataConsent: true,
                healthDataConsentAt: true,
                createdAt: true,
            }
        });

        return NextResponse.json(updatedProfile);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        if (body?.confirm !== 'DELETE') {
            return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
        }

        let adminClient;
        try {
            adminClient = createAdminClient();
        } catch {
            return NextResponse.json({ error: 'Account deletion not configured' }, { status: 500 });
        }

        await deleteAccountRecords(user.id);

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
        if (deleteError) {
            return NextResponse.json({
                error: 'Data deleted, but auth removal failed. Contact support.',
                details: deleteError.message,
            }, { status: 502 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
