'use client';

import { SWRConfig, Cache } from 'swr';
import { ReactNode, useEffect, useState } from 'react';

const CACHE_STORAGE_KEY = 'datalyst-swr-cache';

// Hard ceiling on what we hand to localStorage. Past a few hundred KB the
// blocking JSON.parse on the next launch is felt as a frozen splash on phones,
// and localStorage throws once the origin quota (~5MB) is reached.
const MAX_CACHE_BYTES = 512 * 1024;

function readPersistedCache(map: Map<string, unknown>) {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(CACHE_STORAGE_KEY);
    } catch {
        return; // Storage disabled (private mode, blocked cookies) — run cacheless.
    }
    if (!stored || stored.length > MAX_CACHE_BYTES) {
        // Oversized payloads from older builds get dropped rather than parsed.
        if (stored) {
            try { localStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* nothing to do */ }
        }
        return;
    }

    try {
        const parsed = JSON.parse(stored);
        for (const [key, value] of Object.entries(parsed)) {
            map.set(key, value);
        }
    } catch (e) {
        console.warn('Failed to parse SWR cache from localStorage:', e);
        try { localStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* nothing to do */ }
    }
}

function writePersistedCache(map: Map<string, unknown>) {
    const obj: Record<string, unknown> = {};
    map.forEach((value, key) => {
        // Only cache API responses, not errors
        if (key.startsWith('/api') || key.startsWith('$swr$')) {
            obj[key] = value;
        }
    });

    let serialized: string;
    try {
        serialized = JSON.stringify(obj);
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
        try { localStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* nothing to do */ }
    }
}

// LocalStorage provider for SWR cache persistence
function localStorageProvider(): Cache {
    const map = new Map<string, unknown>();

    // Only run on client
    if (typeof window === 'undefined') {
        return map as unknown as Cache;
    }

    readPersistedCache(map);

    // visibilitychange, not beforeunload: WKWebView does not reliably fire
    // beforeunload when a Capacitor app is backgrounded, and registering it
    // disables the back/forward cache.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') writePersistedCache(map);
    });

    return map as Cache;
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
}

export function SWRProvider({ children }: SWRProviderProps) {
    const [mounted, setMounted] = useState(false);

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
