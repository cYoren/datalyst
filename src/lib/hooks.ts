'use client';

import useSWR from 'swr';
import { Habit } from '@/types';

// Generic fetcher for SWR
export const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 401) {
            // Redirect to login on unauthorized
            window.location.href = '/login';
            throw new Error('Unauthorized');
        }
        throw new Error(`Failed to fetch: ${res.status}`);
    }
    return res.json();
};

// SWR configuration for optimal caching
// Note: Global config is set in SWRProvider, but these can override per-hook
const swrConfig = {
    revalidateOnFocus: false, // Don't refetch when window regains focus
    revalidateOnReconnect: true,
    revalidateIfStale: true, // Still revalidate stale data in background
    keepPreviousData: true, // Show cached data while revalidating (no loading spinner)
    dedupingInterval: 120000, // Dedupe requests within 2 minutes
    focusThrottleInterval: 60000, // Throttle focus revalidation to 1 minute
    errorRetryCount: 2,
};

// Hook for fetching habits
export function useHabits() {
    const { data, error, isLoading, mutate } = useSWR('/api/habits', fetcher, swrConfig);
    return {
        habits: (data || []) as Habit[],
        isLoading,
        isError: error,
        refresh: mutate
    };
}

// Hook for fetching dashboard stats
export function useDashboardStats() {
    const { data, error, isLoading } = useSWR('/api/dashboard/stats', fetcher, swrConfig);
    return {
        stats: data,
        isLoading,
        isError: error
    };
}

// Hook for fetching insights
export function useInsights() {
    const { data, error, isLoading } = useSWR('/api/insights', fetcher, swrConfig);
    return {
        insights: data,
        isLoading,
        isError: error
    };
}

// Hook for fetching user info
export function useUser() {
    const { data, error, isLoading, mutate } = useSWR('/api/user', fetcher, {
        ...swrConfig,
        revalidateOnFocus: false,
        dedupingInterval: 300000, // User data rarely changes - cache for 5 minutes
    });
    return {
        user: data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

// Hook for combined dashboard data (uses individual hooks for maximum cache efficiency)
// DEPRECATED: Use useDashboard() for better performance
export function useDashboardData() {
    const { habits, isLoading: habitsLoading, refresh: refreshHabits } = useHabits();
    const { stats, isLoading: statsLoading } = useDashboardStats();
    const { insights, isLoading: insightsLoading } = useInsights();
    const { user, isLoading: userLoading } = useUser();

    return {
        habits,
        stats,
        insights,
        user,
        isLoading: habitsLoading || statsLoading || insightsLoading || userLoading,
        refreshHabits
    };
}

// NEW: Single-request dashboard hook for optimal performance
export function useDashboard() {
    const { data, error, isLoading, mutate } = useSWR('/api/dashboard', fetcher, {
        ...swrConfig,
        dedupingInterval: 30000, // 30 second cache for dashboard
    });
    const habits = (data?.habits || []) as Habit[];

    return {
        habits,
        stats: data?.stats || null,
        insights: data?.insights || null,
        user: data?.user || null,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

// Hook for fetching data page content
export function useDataPage() {
    const { data, error, isLoading } = useSWR('/api/data', fetcher, swrConfig);
    return {
        habits: data?.habits || [],
        entries: data?.entries || [],
        isLoading,
        isError: error
    };
}

// Hook for fetching logs page content
export function useLogsPage() {
    const { data, error, isLoading } = useSWR('/api/logs', fetcher, swrConfig);
    return {
        events: data?.events || [],
        sessions: data?.sessions || [],
        isLoading,
        isError: error
    };
}
