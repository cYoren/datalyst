/**
 * One entitlement function (`ROADMAP.md` M1).
 *
 * Gates ask this instead of inventing their own rule, so a feature cannot be free in one place
 * and paid in another. **How many gates exist today: one** — `experiments-in-parallel`, refused
 * in `createExperiment`. The rest of the table is the agreed shape of the plan, not a claim that
 * each line is enforced; `ROADMAP.md` M2 is where the gated screens land, and each one that
 * arrives adds a caller here.
 *
 * The price is deliberately absent: this file decides *whether* a feature is available, never
 * what it costs (that is `docs/OPEN-DECISIONS.md` §1).
 */

export const PLAN_NAMES = ['free', 'plus'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

/**
 * The features a gate can ask about. Named after the things a person reaches for, not after the
 * tables behind them, so a gate reads like the screen it protects.
 *
 * Being in this list means the *plan* covers it. Being enforced is a separate fact, and today
 * only `experiments-in-parallel` is (see the header).
 */
export const FEATURES = [
    // Free, for good. Listed explicitly so "not in the table" is a decision, not an oversight.
    'trackers',
    'check-ins',
    'widgets',
    'patterns',
    'one-experiment-at-a-time',
    'export',
    'connected-apps',
    'self-hosted',
    // Plus.
    'ai-quick-log',
    'ai-explanations',
    'health-import',
    'experiments-in-parallel',
    'assistant-access-beyond-allowance',
] as const;

export type Feature = (typeof FEATURES)[number];

/** Everything a Free account can do, and nothing else. */
export const FREE_FEATURES: readonly Feature[] = [
    'trackers',
    'check-ins',
    'widgets',
    'patterns',
    'one-experiment-at-a-time',
    'export',
    'connected-apps',
    'self-hosted',
];

/** What Plus adds on top of Free. */
export const PLUS_FEATURES: readonly Feature[] = [
    ...FREE_FEATURES,
    'ai-quick-log',
    'ai-explanations',
    'health-import',
    'experiments-in-parallel',
    'assistant-access-beyond-allowance',
];

const BY_PLAN: Record<PlanName, ReadonlySet<Feature>> = {
    free: new Set(FREE_FEATURES),
    plus: new Set(PLUS_FEATURES),
};

export interface Entitled {
    plan?: string | null;
}

/** True when this account's plan includes the feature. An unknown plan is treated as Free. */
export function can(account: Entitled, feature: Feature): boolean {
    const plan = normalizePlan(account.plan);
    return BY_PLAN[plan].has(feature);
}

/** Anything unrecognised is Free: a typo in a database column must not grant Plus. */
export function normalizePlan(plan: string | null | undefined): PlanName {
    return plan === 'plus' ? 'plus' : 'free';
}

/**
 * Self-hosted is its own answer, not a plan: the operator runs the server and pays for it.
 * Kept separate from `can` so no route has to remember to special-case it.
 */
export function canWithSelfHosted(account: Entitled, feature: Feature, selfHosted: boolean): boolean {
    return selfHosted ? true : can(account, feature);
}

/** The three lines a gate screen shows, so the copy is written once (`ROADMAP.md` M2). */
export const PLUS_SUMMARY = [
    'AI quick log and explanations, so a sentence becomes a check-in',
    'Apple Health and Health Connect import, so history starts on day one',
    'Several experiments at once, and assistant access beyond the small allowance',
] as const;

export const FREE_LIMITS = {
    /** Enforced in `createExperiment`: Free runs one experiment at a time. */
    concurrentExperiments: 1,
} as const;
