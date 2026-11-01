'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HabitForm, type HabitFormData } from '@/components/forms/HabitForm';
import { BookOpen } from 'lucide-react';

export default function NewHabitPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSubmit = async (data: HabitFormData) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                // Check if response is JSON before trying to parse it
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const json = await res.json();
                    const errorMessage = json.error ? JSON.stringify(json.error) : 'Error creating tracker';
                    alert(errorMessage);
                    throw new Error(errorMessage);
                } else {
                    alert('Error creating tracker: Server returned unexpected error');
                    throw new Error('Server returned non-JSON error');
                }
            }

            router.push('/dashboard');
        } catch (error) {
            console.error(error);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">New Tracker</h1>
                    <p className="text-[var(--text-secondary)]">Configure what you want to track and measure.</p>
                </div>
                <Link
                    href="/habits/templates"
                    className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:underline"
                >
                    <BookOpen className="h-4 w-4" />
                    Browse Templates
                </Link>
            </header>

            <HabitForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </div>
    );
}
