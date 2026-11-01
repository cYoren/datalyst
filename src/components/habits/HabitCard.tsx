'use client';

import React from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';

import { Check, Plus, Edit2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Habit } from '@/types';

interface HabitCardProps {
    habit: Habit;
    onRegister: () => void;
    isCompleted?: boolean;
    onArchive?: () => void;
}

export const HabitCard = ({ habit, onRegister, isCompleted = false, onArchive }: HabitCardProps) => {
    const router = useRouter();
    const [showArchiveConfirm, setShowArchiveConfirm] = React.useState(false);
    const [isArchiving, setIsArchiving] = React.useState(false);

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowArchiveConfirm(true);
    };

    const confirmArchive = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsArchiving(true);
        try {
            const res = await fetch(`/api/habits/${habit.id}`, { method: 'DELETE' });
            if (res.ok) {
                onArchive?.();
            }
        } catch (err) {
            console.error('Failed to archive:', err);
        } finally {
            setIsArchiving(false);
            setShowArchiveConfirm(false);
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering onRegister
        router.push(`/habits/${habit.id}/edit`);
    };

    return (
        <Card
            className={cn(
                "relative overflow-hidden transition-all duration-300 group cursor-pointer border",
                isCompleted
                    ? "bg-[var(--color-bg-subtle)] border-transparent shadow-none opacity-80"
                    : "bg-[var(--color-bg-card)] border-[var(--color-border)]  paper-lift"
            )}
            onClick={onRegister}
        >
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-5">
                    {/* Icon Container */}
                    <div
                        className={cn(
                            "h-14 w-14 rounded-[var(--radius-card)] flex items-center justify-center text-2xl transition-colors",
                            isCompleted
                                ? "bg-[var(--color-border)] text-[var(--color-text-tertiary)] grayscale"
                                : "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                        )}
                        style={!isCompleted ? { backgroundColor: `${habit.color}15`, color: habit.color } : {}}
                    >
                        <TrackerIcon value={habit.icon} className="h-5 w-5" />
                    </div>

                    {/* Text Info */}
                    <div>
                        <h3 className={cn(
                            "text-lg font-semibold transition-colors font-display",
                            isCompleted ? "text-[var(--text-secondary)] line-through decoration-[var(--color-border)]" : "text-[var(--text-primary)]"
                        )}>
                            {habit.name}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                            {isCompleted ? 'Completed today' : habit.description || `${habit.subvariables?.length || 0} metrics`}
                        </p>
                    </div>
                </div>

                {/* Action Indicators */}
                <div className="flex items-center gap-2">
                    {/* Archive Button */}
                    <button
                        onClick={handleArchive}
                        className={cn(
                            "h-10 w-10 rounded-[var(--radius-button)] flex items-center justify-center transition-all",
                            "bg-[var(--color-bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--color-coral)]/10 hover:text-[var(--color-coral)]",
                            "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        )}
                        title="Archive tracker"
                    >
                        <Trash2 className="h-4 w-4" suppressHydrationWarning />
                    </button>

                    {/* Edit Button - Visible on mobile/touch, or on hover on desktop */}
                    <button
                        onClick={handleEdit}
                        className={cn(
                            "h-10 w-10 rounded-[var(--radius-button)] flex items-center justify-center transition-all",
                            "bg-[var(--color-bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--text-primary)]",
                            "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        )}
                        title="Edit habit"
                    >
                        <Edit2 className="h-4 w-4" suppressHydrationWarning />
                    </button>

                    {/* Completion Indicator */}
                    {isCompleted ? (
                        <div className="h-10 w-10 rounded-[var(--radius-button)] bg-[var(--color-success)]/10 text-[var(--color-success)] flex items-center justify-center animate-scale-in">
                            <Check className="h-5 w-5" suppressHydrationWarning />
                        </div>
                    ) : (
                        <div className={cn(
                            "h-10 w-10 rounded-[var(--radius-button)] flex items-center justify-center transition-all",
                            "bg-[var(--color-bg-subtle)] text-[var(--color-text-tertiary)]",
                            "sm:group-hover:bg-[var(--color-accent)] sm:group-hover:text-[var(--color-on-accent)]",
                            "group-active:bg-[var(--color-accent)] group-active:text-[var(--color-on-accent)]" // Feedback on tap
                        )}>
                            <Plus className="h-5 w-5" suppressHydrationWarning />
                        </div>
                    )}
                </div>
            </div>

            {/* Archive Confirmation Overlay */}
            {showArchiveConfirm && (
                <div
                    className="absolute inset-0 bg-[var(--color-bg-card)]/95 z-10 flex items-center justify-center gap-3 p-4 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-sm text-[var(--text-secondary)]">Archive <strong>{habit.name}</strong>?</p>
                    <button
                        onClick={confirmArchive}
                        disabled={isArchiving}
                        className="px-3 py-1.5 text-sm font-medium bg-[var(--color-coral)] text-[var(--color-on-accent)] rounded-[var(--radius-card)] hover:bg-[var(--color-coral)] transition-colors disabled:opacity-50"
                    >
                        {isArchiving ? 'Archiving...' : 'Archive'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowArchiveConfirm(false); }}
                        className="px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

        </Card>
    );
};
