'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('App Error:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-fade-in">
            <div className="h-20 w-20 rounded-full bg-[var(--color-coral)]/10 text-[var(--color-coral)] flex items-center justify-center mb-6">
                <AlertTriangle className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Something went wrong</h2>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
                We encountered an unexpected error. This might be due to a poor connection or an internal issue.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button
                    onClick={() => reset()}
                    className="flex-1 gap-2"
                >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                </Button>
                <Button
                    variant="outline"
                    onClick={() => window.location.href = '/dashboard'}
                >
                    Go to Dashboard
                </Button>
            </div>
        </div>
    );
}
