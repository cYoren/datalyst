'use client';

import React, { useState } from 'react';
import { TrackerIcon } from '@/components/ui/TrackerIcon';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Slider } from '@/components/ui/Slider';
import { SubvariableType } from '@/lib/subvariable-types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarDays, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { SubvariableMetadata } from '@/types';

export interface EntryEditFormProps {
    entry: {
        id: string;
        logicalDate: string;
        note?: string;
        habit: {
            id: string;
            name: string;
            icon: string;
            color: string;
            subvariables: Array<{
                id: string;
                name: string;
                type: SubvariableType;
                unit?: string;
                metadata?: SubvariableMetadata;
                order: number;
            }>;
        };
        subvariableEntries: Array<{
            subvariableId: string;
            numericValue: number;
            rawValue?: string;
        }>;
    };
    onSuccess: () => void;
    onCancel: () => void;
    onDelete?: () => void;
}

export const EntryEditForm = ({ entry, onSuccess, onCancel, onDelete }: EntryEditFormProps) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [values, setValues] = useState<Record<string, number>>({});
    const [note, setNote] = useState(entry.note || '');
    const [logicalDate, setLogicalDate] = useState(
        format(new Date(entry.logicalDate), 'yyyy-MM-dd')
    );

    // Initialize values from existing entry
    const [syncedEntry, setSyncedEntry] = useState<typeof entry>();
    if (syncedEntry !== entry) {
        setSyncedEntry(entry);
        const initial: Record<string, number> = {};

        // First set defaults for all subvariables
        entry.habit.subvariables.forEach((sub) => {
            if (sub.type === SubvariableType.SCALE_0_10) initial[sub.id] = 5;
            else if (sub.type === SubvariableType.BOOLEAN) initial[sub.id] = 0;
            else initial[sub.id] = 0;
        });

        // Then override with actual entry values
        entry.subvariableEntries.forEach((subEntry) => {
            initial[subEntry.subvariableId] = subEntry.numericValue;
        });

        setValues(initial);
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const subvariableEntries = Object.entries(values).map(([subId, val]) => ({
                subvariableId: subId,
                numericValue: val,
            }));

            const res = await fetch(`/api/entries/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logicalDate: new Date(logicalDate + 'T12:00:00').toISOString(),
                    note,
                    subvariableEntries,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update entry');
            }

            onSuccess();
        } catch (error) {
            console.error(error);
            alert('Error updating entry');
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        setIsDeleting(true);

        try {
            const res = await fetch(`/api/entries/${entry.id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                throw new Error('Failed to delete entry');
            }

            if (onDelete) {
                onDelete();
            } else {
                onSuccess();
            }
        } catch (error) {
            console.error(error);
            alert('Error deleting entry');
            setIsDeleting(false);
        }
    };

    const updateValue = (subId: string, val: number) => {
        setValues((prev) => ({ ...prev, [subId]: val }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Header with Protocol info */}
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
                <TrackerIcon value={entry.habit.icon} className="h-6 w-6 shrink-0" />
                <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">
                        {entry.habit.name}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Editing entry
                    </p>
                </div>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
                <label className="label-mono flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" suppressHydrationWarning />
                    Date
                </label>
                <input
                    type="date"
                    value={logicalDate}
                    onChange={(e) => setLogicalDate(e.target.value)}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full h-10 px-3 rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-primary)] focus:bg-[var(--color-control-bg-focus)] focus:outline-none transition-colors"
                />
            </div>

            {/* Variables */}
            <div className="space-y-4">
                {entry.habit.subvariables.map((sub) => (
                    <div key={sub.id} className="space-y-2">
                        <div className="flex justify-between items-end">
                            <label className="text-sm font-medium text-[var(--text-primary)]">
                                {sub.name}
                            </label>
                            {sub.unit && (
                                <span className="text-xs text-[var(--text-tertiary)] bg-[var(--color-bg-subtle)] px-2 py-1 rounded-full">
                                    {sub.unit}
                                </span>
                            )}
                        </div>

                        {sub.type === SubvariableType.SCALE_0_10 && (
                            <Slider
                                value={values[sub.id] ?? 5}
                                onChange={(v) => updateValue(sub.id, v)}
                                min={0}
                                max={10}
                                labels={sub.metadata?.labels}
                            />
                        )}

                        {sub.type === SubvariableType.NUMERIC && (
                            <Input
                                type="number"
                                step={sub.metadata?.step || 1}
                                value={values[sub.id] ?? ''}
                                onChange={(e) => updateValue(sub.id, parseFloat(e.target.value) || 0)}
                                className="text-lg font-medium text-center h-12"
                            />
                        )}

                        {sub.type === SubvariableType.BOOLEAN && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => updateValue(sub.id, 1)}
                                    className={cn(
                                        'flex-1 py-3 rounded-[var(--radius-card)] transition-all font-medium border-2',
                                        values[sub.id] === 1
                                            ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent'
                                            : 'bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)] hover:border-[var(--color-accent)]'
                                    )}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateValue(sub.id, 0)}
                                    className={cn(
                                        'flex-1 py-3 rounded-[var(--radius-card)] transition-all font-medium border-2',
                                        values[sub.id] === 0
                                            ? 'bg-[var(--text-tertiary)] text-white border-transparent'
                                            : 'bg-[var(--color-control-bg)] border-[var(--color-control-border)] text-[var(--text-secondary)] hover:bg-[var(--color-control-bg-hover)] hover:border-[var(--text-tertiary)]'
                                    )}
                                >
                                    No
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Notes */}
            <div>
                <Input
                    placeholder="Notes (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="bg-[var(--color-control-bg)] border-transparent focus:bg-[var(--color-control-bg-focus)]"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    className="text-[var(--color-coral)] hover:text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                >
                    {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    className="flex-[2]"
                    isLoading={isSubmitting}
                >
                    Save Changes
                </Button>
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="Delete Entry?"
            >
                <div className="space-y-4">
                    <p className="text-[var(--text-secondary)]">
                        Are you sure you want to delete this entry? This action cannot be undone.
                    </p>
                    <div className="flex gap-3 justify-end">
                        <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            className="bg-[var(--color-coral)] hover:bg-[var(--color-coral)] text-[var(--color-on-accent)]"
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Modal>
        </form>
    );
};

export default EntryEditForm;
