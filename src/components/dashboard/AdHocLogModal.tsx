'use client';

import React, { useState } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import useSWR from 'swr';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Search, X, Loader2, AlertCircle } from 'lucide-react';
import { fetcher } from '@/lib/hooks';
import { formatLocalDateKey } from '@/lib/dateUtils';

interface AdHocHabit {
    id: string;
    name: string;
    icon: string;
    color: string;
    subvariables: {
        id: string;
        name: string;
        type: string;
    }[];
}

interface AdHocLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogComplete?: () => void;
}



export default function AdHocLogModal({ isOpen, onClose, onLogComplete }: AdHocLogModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHabit, setSelectedHabit] = useState<AdHocHabit | null>(null);
    const [values, setValues] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch ADHOC habits
    const { data: habits, isLoading, error } = useSWR<AdHocHabit[]>(
        isOpen ? '/api/habits/adhoc' : null,
        fetcher,
        {
            keepPreviousData: true,
            dedupingInterval: 120000,
        }
    );

    // Filter habits by search query
    const filteredHabits = Array.isArray(habits) ? (
        !searchQuery.trim() ? habits : habits.filter(h =>
            h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            h.subvariables.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    ) : [];

    // Handle value change for a subvariable
    const handleValueChange = (subId: string, value: number) => {
        setValues(prev => ({ ...prev, [subId]: value }));
    };

    // Submit log entry
    const handleSubmit = async () => {
        if (!selectedHabit) return;

        setIsSubmitting(true);
        try {
            const today = formatLocalDateKey(new Date());

            const res = await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    habitId: selectedHabit.id,
                    logicalDate: new Date(today).toISOString(),
                    subvariableEntries: Object.entries(values).map(([subId, value]) => ({
                        subvariableId: subId,
                        numericValue: value,
                    })),
                }),
            });

            if (res.ok) {
                onLogComplete?.();
                handleClose();
            }
        } catch (error) {
            console.error('Failed to log entry:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSearchQuery('');
        setSelectedHabit(null);
        setValues({});
        onClose();
    };

    const handleSelectHabit = (habit: AdHocHabit) => {
        setSelectedHabit(habit);
        // Initialize values for all subvariables
        const initialValues: Record<string, number> = {};
        habit.subvariables.forEach(sub => {
            initialValues[sub.id] = sub.type === 'BOOLEAN' ? 0 : 0;
        });
        setValues(initialValues);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Ad-hoc Check-in">
            <div className="space-y-4">
                {!selectedHabit ? (
                    <>
                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search ad-hoc items..."
                                className="pl-10"
                                autoFocus
                            />
                        </div>

                        {/* Habits List */}
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                            {isLoading && !habits ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-violet)]" />
                                </div>
                            ) : error ? (
                                <div className="text-center py-8 text-[var(--color-coral)]">
                                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-[var(--color-coral)]" />
                                    <p className="font-medium text-sm">Failed to load items</p>
                                    <p className="text-xs mt-1 opacity-80">Please try again later</p>
                                </div>
                            ) : filteredHabits.length === 0 ? (
                                <div className="text-center py-8 text-[var(--color-text-secondary)]">
                                    <p className="mb-2">No ad-hoc items found</p>
                                    <p className="text-sm">Create a tracker with the ad-hoc schedule type</p>
                                </div>
                            ) : (
                                filteredHabits.map(habit => (
                                    <button
                                        key={habit.id}
                                        onClick={() => handleSelectHabit(habit)}
                                        className="w-full p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] hover:border-[var(--color-violet)]/40 hover:bg-[var(--color-violet)]/10 transition-all text-left flex items-center gap-3"
                                    >
                                        <TrackerIcon value={habit.icon} className="h-5 w-5 shrink-0" />
                                        <div>
                                            <div className="font-medium text-[var(--text-primary)]">{habit.name}</div>
                                            <div className="text-xs text-[var(--color-text-secondary)]">
                                                {habit.subvariables.map(s => s.name).join(', ')}
                                            </div>
                                        </div>
                                        <span className="ml-auto text-xs bg-[var(--color-violet)]/15 text-[var(--color-violet)] px-2 py-0.5 rounded-full">
                                            Ad-hoc
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Selected Habit Header */}
                        <div className="flex items-center gap-3 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-card)]">
                            <TrackerIcon value={selectedHabit.icon} className="h-6 w-6 shrink-0" />
                            <div className="flex-1">
                                <div className="font-medium text-[var(--text-primary)]">{selectedHabit.name}</div>
                            </div>
                            <button onClick={() => setSelectedHabit(null)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Subvariable Inputs */}
                        <div className="space-y-3">
                            {selectedHabit.subvariables.map(sub => (
                                <div key={sub.id} className="space-y-1">
                                    <label className="label-mono">{sub.name}</label>
                                    {sub.type === 'BOOLEAN' ? (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleValueChange(sub.id, 0)}
                                                className={cn(
                                                    "flex-1 py-2 rounded-[var(--radius-card)] border transition-all",
                                                    values[sub.id] === 0
                                                        ? "bg-[var(--color-coral)]/15 border-[var(--color-coral)]/40 text-[var(--color-coral)]"
                                                        : "bg-[var(--color-bg-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)]"
                                                )}
                                            >
                                                No
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleValueChange(sub.id, 1)}
                                                className={cn(
                                                    "flex-1 py-2 rounded-[var(--radius-card)] border transition-all",
                                                    values[sub.id] === 1
                                                        ? "bg-[var(--color-teal)]/15 border-[var(--color-teal)]/40 text-[var(--color-teal)]"
                                                        : "bg-[var(--color-bg-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)]"
                                                )}
                                            >
                                                Yes
                                            </button>
                                        </div>
                                    ) : sub.type === 'SCALE_0_10' ? (
                                        <div className="flex gap-1">
                                            {[...Array(11)].map((_, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => handleValueChange(sub.id, i)}
                                                    className={cn(
                                                        "flex-1 py-2 rounded text-sm transition-all",
                                                        values[sub.id] === i
                                                            ? "bg-[var(--color-violet)] text-[var(--color-on-accent)]"
                                                            : "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"
                                                    )}
                                                >
                                                    {i}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <Input
                                            type="number"
                                            value={values[sub.id] || ''}
                                            onChange={(e) => handleValueChange(sub.id, parseFloat(e.target.value) || 0)}
                                            placeholder="Enter value..."
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Submit Button */}
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="w-full"
                            isLoading={isSubmitting}
                        >
                            Save Check-in
                        </Button>
                    </>
                )}
            </div>
        </Modal>
    );
}
