'use client';

import { Loader2 } from 'lucide-react';

export default function LogsLoading() {
    return (
        <div className="flex items-center justify-center h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
        </div>
    );
}
