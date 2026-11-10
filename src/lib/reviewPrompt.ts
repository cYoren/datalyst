/**
 * Store review prompts.
 *
 * Both stores allow at most three prompts per user per year and silently drop
 * the extras, so the goal is never to ask more often. It is to spend each of
 * the three asks at the strongest possible moment.
 *
 * Anything that could read as a bad experience does not count, and a user who
 * has just sent negative feedback is suppressed outright. Asking straight
 * after a failure is how apps earn the one-star ratings they were avoiding.
 *
 * This is the Capacitor sibling of the Dart service in
 * Games/shared-assets/review_prompt_service.dart and of medhub's
 * src/core/services/reviewPromptService.ts. The gate is deliberately identical
 * in all three: weight, cooldown, suppression, dedupe.
 */

/** What a moment is worth toward REQUIRED_WEIGHT. */
export const MOMENT_WEIGHTS = {
    /** An ordinary win: one variable logged. */
    routine: 1,
    /** A real step up: a week of unbroken tracking. */
    progression: 2,
    /** The app's peak moment: a full day's check-in completed. */
    peak: 3,
} as const;

export type MomentKind = keyof typeof MOMENT_WEIGHTS;

const STATE_KEY = 'datalyst:review-prompt-state-v1';
/** Accumulated weight required before the first ask. */
export const REQUIRED_WEIGHT = 3;
/** 120 days is roughly three asks a year, which is the platform ceiling. */
export const PROMPT_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

interface ReviewState {
    weight: number;
    lastPromptAt?: number;
    suppressedUntil?: number;
    /** Milestones already spent, so a recomputed value cannot double-count. */
    creditedKeys?: string[];
}

/** Injection points for tests. Production leaves all three undefined. */
export const reviewPromptTestUtils: {
    now?: () => number;
    reviewApi?: { requestReview: () => Promise<void> };
    isNative?: () => boolean;
    reset: () => void;
} = {
    reset() {
        reviewPromptTestUtils.now = undefined;
        reviewPromptTestUtils.reviewApi = undefined;
        reviewPromptTestUtils.isNative = undefined;
        try {
            window.localStorage.removeItem(STATE_KEY);
        } catch {
            /* nothing stored is the same as a fresh state */
        }
    },
};

const now = () => (reviewPromptTestUtils.now ?? Date.now)();

function readState(): ReviewState {
    try {
        const raw = window.localStorage.getItem(STATE_KEY);
        return raw ? (JSON.parse(raw) as ReviewState) : { weight: 0 };
    } catch {
        return { weight: 0 };
    }
}

function writeState(state: ReviewState): void {
    try {
        window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
        /* Losing the counter costs one prompt, never a crash. */
    }
}

/**
 * Stop asking for `days`. Call this the moment a user signals displeasure,
 * such as sending negative feedback or reporting a bug.
 */
export function suppressReviewPrompts(days = 30): void {
    const state = readState();
    state.suppressedUntil = now() + days * 24 * 60 * 60 * 1000;
    writeState(state);
}

/**
 * The web build has no store to review, so the prompt is native-only. Checked
 * lazily because @capacitor/core is not safe to touch during SSR.
 */
async function onNativePlatform(): Promise<boolean> {
    if (reviewPromptTestUtils.isNative) return reviewPromptTestUtils.isNative();
    if (typeof window === 'undefined') return false;
    try {
        const { Capacitor } = await import('@capacitor/core');
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

/**
 * Record a positive moment, and prompt if this one tips the user over.
 *
 * Pass `dedupeKey` for milestones that get recomputed, so a value recalculated
 * on every render cannot bank credit repeatedly.
 *
 * Returns whether the store prompt was actually requested.
 */
export async function recordPositiveMoment(
    kind: MomentKind,
    options: { dedupeKey?: string } = {},
): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const state = readState();

    if (options.dedupeKey) {
        const credited = state.creditedKeys ?? [];
        if (credited.includes(options.dedupeKey)) return false;
        state.creditedKeys = [...credited, options.dedupeKey];
    }

    state.weight += MOMENT_WEIGHTS[kind];

    const t = now();
    const cooledDown =
        !state.lastPromptAt || t - state.lastPromptAt >= PROMPT_COOLDOWN_MS;
    const unsuppressed = !state.suppressedUntil || t >= state.suppressedUntil;

    if (state.weight < REQUIRED_WEIGHT || !cooledDown || !unsuppressed) {
        writeState(state);
        return false;
    }

    if (!(await onNativePlatform())) {
        writeState(state);
        return false;
    }

    try {
        const api =
            reviewPromptTestUtils.reviewApi ??
            (await import('@capacitor-community/in-app-review')).InAppReview;
        // Store guidelines prefer an automatic request right after a signature
        // success moment, not a custom button or a rating pre-screen.
        await api.requestReview();
        state.lastPromptAt = t;
        // Reset the accumulator so the next ask needs fresh evidence rather
        // than riding on credit earned before this prompt.
        state.weight = 0;
        writeState(state);
        return true;
    } catch {
        writeState(state);
        return false;
    }
}

/**
 * Record a completed day of tracking. Finishing every variable for the day is
 * the peak moment in an N-of-1 tracker, so it is worth an ask on its own; a
 * single logged variable has to stack up with others first.
 */
export function recordCheckIn(opts: {
    dayComplete: boolean;
    logicalDate: string;
}): Promise<boolean> {
    return opts.dayComplete
        ? recordPositiveMoment('peak', { dedupeKey: `day-${opts.logicalDate}` })
        : recordPositiveMoment('routine');
}

/** Forget the local review-prompt history when its account is deleted. */
export function clearReviewPromptState(): void {
    try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(STATE_KEY);
    } catch {
        /* best-effort local cleanup */
    }
}
