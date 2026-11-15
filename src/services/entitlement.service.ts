/**
 * Reading the entitlement for a request (`ROADMAP.md` M1).
 *
 * `src/lib/entitlement.ts` stays pure so every rule is testable without a database; this is the
 * one place that turns an account id into a decision. Gates call `can(await entitlementFor(id), …)`
 * and never read the column themselves.
 */

import { prisma } from '@/lib/prisma';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { can, type Entitled, type Feature } from '@/lib/entitlement';

export async function entitlementFor(userId: string): Promise<Entitled> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    return { plan: user?.plan ?? 'free' };
}

/**
 * The question a gate asks: may this account use this feature?
 *
 * Self-hosted answers yes without touching the database, because the plan is not what makes a
 * self-hosted install whole.
 */
export async function may(userId: string, feature: Feature): Promise<boolean> {
    if (SELF_HOSTED) return true;
    return can(await entitlementFor(userId), feature);
}
