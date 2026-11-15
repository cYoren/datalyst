import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { ServiceError } from '@/lib/error-utils';
import { resolveConnectRequest } from '@/lib/connect';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { ConnectScreen } from './ConnectScreen';

/**
 * `/connect` — the one screen a person sees before an app gets access
 * (`docs/CONNECTED-APPS.md`, "Connecting", step 2).
 *
 * Server-rendered so the app's declaration and the person's own variables come from the same
 * place the approval will use: the list shown is the list granted.
 */
export default async function ConnectPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const single = (key: string) => {
        const value = params[key];
        return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null;
    };

    let request;
    try {
        request = resolveConnectRequest({
            appId: single('app'),
            redirectUri: single('redirect_uri'),
            codeChallenge: single('code_challenge'),
            state: single('state'),
        });
    } catch (error) {
        const message = error instanceof ServiceError ? error.message : 'This connection link is not valid.';
        return (
            <main className="mx-auto max-w-lg px-5 py-16">
                <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">This link cannot be used</h1>
                <p className="mt-2 text-[var(--text-secondary)]">{message}</p>
                <p className="mt-4 text-sm text-[var(--text-tertiary)]">
                    Ask the app for a new connect link, or start again from its settings.
                </p>
            </main>
        );
    }

    const user = await getAuthenticatedUser();
    if (!user) {
        // The app opens this in the system browser, so send the person through sign-in and back.
        const next = `/connect?${new URLSearchParams({
            app: request.app.id,
            redirect_uri: request.redirectUri,
            code_challenge: request.codeChallenge,
            state: single('state') ?? '',
        }).toString()}`;
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    const variables = await prisma.subvariable.findMany({
        where: { active: true, habit: { userId: user.id, archived: false } },
        select: { id: true, name: true, unit: true, habit: { select: { name: true } } },
        orderBy: [{ habit: { name: 'asc' } }, { order: 'asc' }],
    });

    return (
        <main className="mx-auto max-w-lg px-5 py-10">
            <ConnectScreen
                app={{
                    id: request.app.id,
                    name: request.app.name,
                    description: request.app.description,
                    writes: request.app.creates.map((tracker) => ({
                        name: tracker.name,
                        variables: tracker.variables.map((variable) => ({
                            name: variable.name,
                            unit: variable.unit ?? null,
                            measured: Boolean(variable.measured),
                        })),
                    })),
                }}
                request={{
                    redirectUri: request.redirectUri,
                    codeChallenge: request.codeChallenge,
                    state: single('state') ?? '',
                }}
                variables={variables.map((variable) => ({
                    id: variable.id,
                    name: variable.name,
                    unit: variable.unit,
                    habitName: variable.habit.name,
                }))}
                cloud={!SELF_HOSTED}
            />
        </main>
    );
}
