'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ScrollText, Activity, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogsPage, useUser } from '@/lib/hooks';

const PAGE_SIZE = 50;

interface LogRecord {
    id: string;
    timestamp: string;
    metadata?: string;
    origin?: string;
    eventType?: string;
    type: 'EVENT' | 'SESSION';
    sortTime: string;
}

export default function LogsPage() {
    const { user, isLoading: userLoading } = useUser();
    const { events, sessions, isLoading: logsLoading } = useLogsPage();
    const [page, setPage] = useState(0);

    const isLoading = userLoading || logsLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
            </div>
        );
    }

    // Combine and sort
    const allLogs = [
        ...events.map((e: { id: string; timestamp: string; metadata?: string; origin?: string; eventType?: string }): LogRecord => ({ ...e, type: 'EVENT', sortTime: e.timestamp })),
        ...sessions.map((s: { id: string; timestamp: string; metadata?: string; origin?: string; eventType?: string }): LogRecord => ({ ...s, type: 'SESSION', sortTime: s.timestamp }))
    ].sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());

    return (
        <div className="space-y-8 pb-20">
            <header className="animate-fade-in">
                <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">
                    System Logs
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    Raw activity and session history.
                </p>
            </header>

            <div className="space-y-4 animate-slide-up">
                {allLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((log: LogRecord) => (
                    <Card key={log.id} className="p-4 border-l-4 border-l-[var(--color-accent)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    {log.type === 'EVENT' ? (
                                        <Activity className="h-5 w-5 text-[var(--color-violet)]" suppressHydrationWarning />
                                    ) : (
                                        <Clock className="h-5 w-5 text-[var(--color-teal)]" suppressHydrationWarning />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-mono text-sm font-bold text-[var(--text-primary)]">
                                        {log.type === 'EVENT' ? log.eventType : 'APP_SESSION_START'}
                                    </h3>
                                    <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1">
                                        ID: {log.id}
                                    </p>
                                    {log.metadata && log.metadata !== '{}' && (
                                        <div className="mt-2 bg-[var(--color-bg-page)] p-2 rounded text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-w-xl">
                                            {log.metadata}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col items-end text-right gap-1">
                                <span className="text-sm font-medium text-[var(--text-primary)]">
                                    {format(new Date(log.sortTime), "MMM dd, HH:mm:ss", { locale: enUS })}
                                </span>
                                <span className="text-xs text-[var(--text-tertiary)]">
                                    {user?.email}
                                </span>
                                {log.origin && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--text-secondary)]">
                                        {log.origin}
                                    </span>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}

                {allLogs.length === 0 && (
                    <div className="text-center py-12 space-y-4">
                        <ScrollText className="h-12 w-12 mx-auto text-[var(--text-tertiary)] opacity-50" suppressHydrationWarning />
                        <div>
                            <p className="text-[var(--text-secondary)] font-medium">No logs yet</p>
                            <p className="text-sm text-[var(--text-tertiary)] mt-1">
                                Activity and session logs will appear here as you use the app.
                            </p>
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {allLogs.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-2 pt-4">
                        <span className="text-sm text-[var(--text-tertiary)]">
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allLogs.length)} of {allLogs.length}
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4" suppressHydrationWarning /> Prev
                            </Button>
                            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= allLogs.length} onClick={() => setPage(p => p + 1)}>
                                Next <ChevronRight className="h-4 w-4" suppressHydrationWarning />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
