'use client';

import { SWRConfig, Cache } from 'swr';
import { ReactNode, useEffect, useRef, useState } from 'react';

const CACHE_STORAGE_KEY = 'datalyst-swr-cache';
// Bumped whenever the persisted shape changes, so an older blob is dropped
// instead of being misread.
const CACHE_VERSION = 2;

// Hard ceiling on what we hand to localStorage. Past a few hundred KB the
// blocking JSON.parse on the next launch is felt as a frozen splash on phones,
// and localStorage throws once the origin quota (~5MB) is reached.
const MAX_CACHE_BYTES = 512 * 1024;

// The account the persisted cache belongs to. Set from the signed-in user by
// SWRProvider. While it is null nothing is persisted and nothing is restored:
// a cache blob whose owner cannot be proven belongs to nobody.
let cacheOwner: string | null = null;

export function setCacheOwner(ownerId: string | null) {
    cacheOwner = ownerId;
}

/** Remove every persisted response cache for this origin, whoever wrote it. */
export function clearPersistedCache() {
    try {
        // key(i) rather than Object.keys: jsdom and some browsers do not enumerate
        // Storage entries as own properties.
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
            const key = localStorage.key(i);
            if (key && (key === CACHE_STORAGE_KEY || key.startsWith(`${CACHE_STORAGE_KEY}:`))) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        /* storage disabled: nothing is persisted, so there is nothing to clear */
    }
}

type PersistedCache = {
    version: number;
    owner: string;
    entries: Record<string, unknown>;
};

export function readPersistedCache(map: Map<string, unknown>) {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(CACHE_STORAGE_KEY);
    } catch {
        return; // Storage disabled (private mode, blocked cookies) — run cacheless.
    }
    if (!stored) {
        return;
    }
    if (stored.length > MAX_CACHE_BYTES) {
        // Oversized payloads from older builds get dropped rather than parsed.
        clearPersistedCache();
        return;
    }

    let persisted: PersistedCache;
    try {
        persisted = JSON.parse(stored) as PersistedCache;
    } catch {
        clearPersistedCache();
        return;
    }

    // The account check is the point of this function: a blob written by another
    // session must never be handed to this one.
    if (
        !persisted ||
        persisted.version !== CACHE_VERSION ||
        typeof persisted.owner !== 'string' ||
        !cacheOwner ||
        persisted.owner !== cacheOwner ||
        typeof persisted.entries !== 'object' ||
        persisted.entries === null
    ) {
        clearPersistedCache();
        return;
    }

    for (const [key, value] of Object.entries(persisted.entries)) {
        map.set(key, value);
    }
}

function writePersistedCache(map: Map<string, unknown>) {
    if (!cacheOwner) {
        // Never write payloads that cannot be attributed to an account.
        return;
    }

    const entries: Record<string, unknown> = {};
    map.forEach((value, key) => {
        // Only cache API responses, not errors
        if (key.startsWith('/api') || key.startsWith('$swr$')) {
            entries[key] = value;
        }
    });

    const payload: PersistedCache = { version: CACHE_VERSION, owner: cacheOwner, entries };

    let serialized: string;
    try {
        serialized = JSON.stringify(payload);
    } catch {
        return; // Non-serializable entry — skip this write rather than throw.
    }

    try {
        if (serialized.length > MAX_CACHE_BYTES) {
            localStorage.removeItem(CACHE_STORAGE_KEY);
            return;
        }
        localStorage.setItem(CACHE_STORAGE_KEY, serialized);
    } catch {
        // Quota exceeded or storage unavailable. Drop the cache so the next
        // launch starts clean instead of failing this write forever.
        clearPersistedCache();
    }
}

// LocalStorage provider for SWR cache persistence
function localStorageProvider(): Cache {
    const map = new Map<string, unknown>();
    let hydrated = false;

    // LocalStorage provider for SWR cache persistence.
    // Hydration waits for the owner: the first fetches of a cold start may run
    // before /api/user answers, and restoring the wrong account's cache is worse
    // than losing one paint.
    const hydrate = () => {
        if (hydrated || !cacheOwner) return;
        hydrated = true;
        readPersistedCache(map);
    };

    // Only run on client
    if (typeof window === 'undefined') {
        return map as unknown as Cache;
    }

    // visibilitychange, not beforeunload: WKWebView does not reliably fire
    // beforeunload when a Capacitor app is backgrounded, and registering it
    // disables the back/forward cache.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') writePersistedCache(map);
    });

    const cache = {
        keys: () => {
            hydrate();
            return map.keys();
        },
        get: (key: string) => {
            hydrate();
            return map.get(key);
        },
        set: (key: string, value: unknown) => {
            hydrate();
            map.set(key, value);
        },
        delete: (key: string) => {
            hydrate();
            return map.delete(key);
        },
    };

    return cache as unknown as Cache;
}

// Global SWR configuration
const swrGlobalConfig = {
    // Show stale data immediately, revalidate in background.
    // Focus revalidation is on: a Capacitor app is backgrounded and resumed
    // constantly, and without it a resume shows indefinitely stale data, which
    // reads as the app being stuck.
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,

    // Keep previous data while loading new data (no flash of loading)
    keepPreviousData: true,

    // Matched to focusThrottleInterval so a resume can actually refetch
    dedupingInterval: 60000,

    // Throttle focus-based revalidation (1 minute)
    focusThrottleInterval: 60000,

    // Retry settings
    errorRetryCount: 2,
    errorRetryInterval: 5000,

    // Use localStorage for persistence
    provider: localStorageProvider,
};

interface SWRProviderProps {
    children: ReactNode;
    /** The signed-in account. The persisted cache is scoped to it. */
    ownerId?: string | null;
}

export function SWRProvider({ children, ownerId }: SWRProviderProps) {
    const [mounted, setMounted] = useState(false);
    const hadOwner = useRef(false);

    // Before children render: the provider below reads this on its first access.
    if (typeof window !== 'undefined') {
        setCacheOwner(ownerId ?? null);
    }

    useEffect(() => {
        if (ownerId) {
            hadOwner.current = true;
            setCacheOwner(ownerId);
            return;
        }
        // An account that was here and is gone: sign-out, expiry, account switch.
        // Not the initial null while /api/user is still in flight.
        if (hadOwner.current) {
            hadOwner.current = false;
            setCacheOwner(null);
            clearPersistedCache();
        }
    }, [ownerId]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    // Render children without SWR config during SSR to avoid hydration mismatch
    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <SWRConfig value={swrGlobalConfig}>
            {children}
        </SWRConfig>
    );
}
