import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { SELF_HOSTED, localAuthClient } from '@/lib/self-hosted';

export function createAdminClient() {
    if (SELF_HOSTED) return localAuthClient() as unknown as ReturnType<typeof createClient>;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
        },
    });
}
