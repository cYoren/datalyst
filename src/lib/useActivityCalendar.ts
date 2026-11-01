'use client';

import useSWR from 'swr';
import { ActivityDay } from '@/types';

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 401) {
            window.location.href = '/login';
            throw new Error('Unauthorized');
        }
        throw new Error(`Failed to fetch activity: ${res.status}`);
    }

    return res.json();
};

export function useActivityCalendar(days: number = 182) {
    const { data, error, isLoading, mutate } = useSWR<{ days: ActivityDay[] }>(
        `/api/dashboard/activity?days=${days}`,
        fetcher,
        {
            dedupingInterval: 60000,
            revalidateOnFocus: true,
            keepPreviousData: true,
        }
    );

    return {
        days: data?.days || [],
        isLoading,
        isError: !!error,
        refresh: mutate,
    };
}
