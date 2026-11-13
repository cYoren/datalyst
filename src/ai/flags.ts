import 'server-only';

/**
 * One switch per AI capability, so any of them can be turned off without a deploy of
 * anything else. With every switch off, no request reaches a provider and the app is the
 * deterministic product it was: statistics, check-in and Lab all keep working.
 *
 *   AI_ENABLED=off              master switch, beats every per-capability value
 *   AI_FEATURE_INSIGHTS=off     one capability
 *
 * A capability that has shipped defaults on; one that has not shipped yet defaults off, so
 * a half-built feature cannot be reached by forgetting to configure it.
 */
export const AI_CAPABILITIES = [
    'insights',
    // Capability B, natural-language entry. There is one switch, not two: `entry_drafts`
    // was a second name for the same code and gating it did nothing.
    'quick_log',
    'protocol_builder',
    'experiment_planner',
    'next_observation',
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

interface CapabilitySpec {
    env: string;
    /** True only once the capability is complete and safe to run for every consented user. */
    shipped: boolean;
}

const SPEC: Record<AiCapability, CapabilitySpec> = {
    insights: { env: 'AI_FEATURE_INSIGHTS', shipped: true },
    quick_log: { env: 'AI_FEATURE_QUICK_LOG', shipped: true },
    protocol_builder: { env: 'AI_FEATURE_PROTOCOL_BUILDER', shipped: false },
    experiment_planner: { env: 'AI_FEATURE_EXPERIMENT_PLANNER', shipped: false },
    next_observation: { env: 'AI_FEATURE_NEXT_OBSERVATION', shipped: false },
};

const TRUTHY = new Set(['on', '1', 'true', 'yes']);
const FALSY = new Set(['off', '0', 'false', 'no']);

function read(value: string | undefined, fallback: boolean): boolean {
    const raw = value?.trim().toLowerCase();
    if (!raw) return fallback;
    if (TRUTHY.has(raw)) return true;
    if (FALSY.has(raw)) return false;
    // An unreadable value is not permission.
    return false;
}

export function aiCapabilityEnabled(
    capability: AiCapability,
    env: Record<string, string | undefined> = process.env,
): boolean {
    if (!read(env.AI_ENABLED, true)) return false;
    return read(env[SPEC[capability].env], SPEC[capability].shipped);
}

/** Every switch at once, for a status endpoint or a support question. */
export function aiCapabilities(env: Record<string, string | undefined> = process.env): Record<AiCapability, boolean> {
    return Object.fromEntries(
        AI_CAPABILITIES.map((capability) => [capability, aiCapabilityEnabled(capability, env)]),
    ) as Record<AiCapability, boolean>;
}
