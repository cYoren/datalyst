/**
 * The agent-facing rate limit, counted in the database instead of in process memory.
 *
 * Kept as a thin shim so every call site keeps its name, its bucket and its headers while the
 * counting moves to `src/lib/rate-limit.ts` (`ROADMAP.md` S2). A subject is the same namespaced
 * string the old in-memory map used (`mcp:<keyId>`, `ai:<userId>:insights`), so nothing changes
 * except that two isolates now share one counter.
 */

export {
    appendRateLimitHeaders,
    checkSubjectRateLimit as checkAgentRateLimit,
    rateLimitedResponse,
    type RateLimitResult,
} from '@/lib/rate-limit';
