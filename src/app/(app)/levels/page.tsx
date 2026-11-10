'use client';

import React, { useMemo } from 'react';
import { DataPageSkeleton } from '@/components/ui/Skeleton';
import { LevelsPanel, type LevelEntry, type LevelTracker } from '@/components/levels/LevelsPanel';
import { useDataPage, useUser } from '@/lib/hooks';

interface ApiSubvariable {
    id: string;
    name: string;
    type: string;
    unit?: string | null;
    active?: boolean;
}

interface ApiHabit {
    id: string;
    name: string;
    subvariables: ApiSubvariable[];
}

interface ApiEntry {
    id: string;
    habitId: string;
    timestamp: string;
    subvariableEntries: Array<{ subvariableId: string; numericValue: number }>;
}

export default function LevelsPage() {
    const { isLoading: userLoading } = useUser();
    const { habits, entries, isLoading } = useDataPage();

    const trackers = useMemo<LevelTracker[]>(() => {
        const list: LevelTracker[] = [];
        for (const habit of habits as ApiHabit[]) {
            for (const subvariable of habit.subvariables ?? []) {
                if (subvariable.type !== 'NUMERIC') continue;
                if (subvariable.active === false) continue;
                list.push({
                    habitId: habit.id,
                    habitName: habit.name,
                    subvariableId: subvariable.id,
                    subvariableName: subvariable.name,
                    unit: subvariable.unit ?? undefined,
                });
            }
        }
        return list;
    }, [habits]);

    const levelEntries = useMemo<LevelEntry[]>(
        () =>
            (entries as ApiEntry[]).map((entry) => ({
                habitId: entry.habitId,
                timestamp: entry.timestamp,
                subvariableEntries: entry.subvariableEntries ?? [],
            })),
        [entries]
    );

    if (userLoading || isLoading) {
        return <DataPageSkeleton />;
    }

    return (
        <div className="flex flex-col gap-8 pb-20">
            <header className="animate-fade-in">
                <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">
                    Levels
                </h1>
                <p className="mt-2 max-w-prose text-[var(--text-secondary)]">
                    Every dose you log fades at its own half-life. Pick the time you want it gone, and the
                    curve tells you when to stop.
                </p>
            </header>

            <div className="animate-slide-up">
                <LevelsPanel trackers={trackers} entries={levelEntries} />
            </div>
        </div>
    );
}
