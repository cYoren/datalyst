/**
 * Self-hosted mode: one local user, no login, no Supabase.
 * Set NEXT_PUBLIC_DATALYST_SELF_HOSTED=1 at build time (the Docker image does).
 * Datalyst Cloud (datalyst.one) runs the same code with this unset.
 */
export const SELF_HOSTED = process.env.NEXT_PUBLIC_DATALYST_SELF_HOSTED === '1';

export const CLOUD_URL = 'https://www.datalyst.one';

export const LOCAL_USER = {
    id: 'local-user',
    email: process.env.NEXT_PUBLIC_DATALYST_LOCAL_EMAIL || 'me@datalyst.local',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
};

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });

/**
 * Stand-in for the Supabase client: every auth call resolves to the local user.
 * `onGetUser` lets the server make sure the local User row exists.
 */
export function localAuthClient(onGetUser?: () => Promise<unknown>) {
    const session = { user: LOCAL_USER, access_token: 'local', refresh_token: 'local' };
    const withUser = () => ok({ user: LOCAL_USER, session });
    return {
        auth: {
            getUser: async () => {
                await onGetUser?.();
                return { data: { user: LOCAL_USER }, error: null };
            },
            getSession: () => ok({ session }),
            signOut: () => ok({}),
            signInWithPassword: withUser,
            signInWithOtp: withUser,
            signInWithOAuth: () => ok({ provider: 'local', url: '/dashboard' }),
            signInWithIdToken: withUser,
            signUp: withUser,
            setSession: withUser,
            exchangeCodeForSession: withUser,
            resetPasswordForEmail: () => ok({}),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            admin: { deleteUser: () => ok({}) },
        },
    };
}
