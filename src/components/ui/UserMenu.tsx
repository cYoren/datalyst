'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { clearWidget } from '@/lib/widget';
import { LogOut, Settings, ChevronDown, PlusCircle, Microscope, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerSelectionHaptic } from '@/lib/haptics';

interface UserMenuProps {
    user: {
        email?: string;
        name?: string;
    };
    variant?: 'desktop' | 'mobile';
}

export function UserMenu({ user, variant = 'desktop' }: UserMenuProps) {
    const router = useRouter();
    // The app's cache provider (persisted), not the module-level default cache.
    const { mutate } = useSWRConfig();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            // Drop cached responses so the next account never sees this one's data,
            // then clear the home screen widget last so no in-flight fetch refills it.
            await mutate(() => true, undefined, { revalidate: false });
            await clearWidget();

            // Also call our logout API to ensure server-side cleanup
            await fetch('/api/auth/logout', {
                method: 'POST',
            });

            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Logout error:', error);
            setIsLoggingOut(false);
        }
    };

    const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email?.[0].toUpperCase() || 'U';

    if (variant === 'mobile') {
        return (
            <div className="relative">
                <button
                    onClick={() => {
                        void triggerSelectionHaptic();
                        setIsOpen(!isOpen);
                    }}
                    className="flex flex-col items-center justify-center p-2 rounded-[var(--radius-button)] transition-all w-16 min-h-[48px] text-[var(--text-secondary)]"
                >
                    <div className="h-7 w-7 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center text-xs font-bold mb-1">
                        {initials}
                    </div>
                    <span className="text-[11px] font-medium">Profile</span>
                </button>

                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40 bg-black/50"
                            onClick={() => setIsOpen(false)}
                        />
                        <div className="absolute bottom-full right-0 mb-4 w-72 bg-[var(--bg-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-elevated)] border border-[var(--color-border)] z-50 overflow-hidden animate-slide-up">
                            <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
                                <p className="font-bold text-[var(--text-primary)] truncate">
                                    {user.name || 'User'}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] truncate opacity-70">
                                    {user.email}
                                </p>
                            </div>

                            <div className="py-2">
                                <Link
                                    href="/habits/new"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full flex items-center gap-3 px-5 py-4 text-[var(--text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                                >
                                    <div className="p-2 rounded-[var(--radius-card)] bg-[var(--color-accent-light)] text-[var(--color-accent)]">
                                        <PlusCircle className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium">New Tracker</span>
                                </Link>
                                <Link
                                    href="/about"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full flex items-center gap-3 px-5 py-4 text-[var(--text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                                >
                                    <div className="p-2 rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] text-[var(--text-secondary)]">
                                        <Microscope className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium">About Datalyst</span>
                                </Link>
                                <Link
                                    href="/lab"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full flex items-center gap-3 px-5 py-4 text-[var(--text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                                >
                                    <div className="p-2 rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] text-[var(--text-secondary)]">
                                        <FlaskConical className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium">Lab (Advanced)</span>
                                </Link>
                                <Link
                                    href="/settings"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full flex items-center gap-3 px-5 py-4 text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                                >
                                    <div className="p-2 rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] text-[var(--text-tertiary)]">
                                        <Settings className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium">Settings</span>
                                </Link>
                            </div>

                            <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]/50 p-2">
                                <button
                                    onClick={async () => {
                                        void triggerSelectionHaptic();
                                        await handleLogout();
                                    }}
                                    disabled={isLoggingOut}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[var(--color-error)] hover:bg-[var(--color-error)]/5 rounded-[var(--radius-button)] transition-colors disabled:opacity-50"
                                >
                                    <LogOut className="h-4 w-4" />
                                    <span className="font-semibold">{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="relative px-4 mt-auto mb-4">
            <button
                onClick={() => {
                    void triggerSelectionHaptic();
                    setIsOpen(!isOpen);
                }}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-button)] transition-all",
                    isOpen ? "bg-[var(--color-bg-subtle)]" : "hover:bg-[var(--color-bg-subtle)]"
                )}
            >
                <div className="h-10 w-10 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center font-bold">
                    {initials}
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-[var(--text-primary)] text-sm truncate">
                        {user.name || 'User'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                        {user.email}
                    </p>
                </div>
                <ChevronDown className={cn(
                    "h-4 w-4 text-[var(--text-tertiary)] transition-transform",
                    isOpen && "rotate-180"
                )} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute bottom-full left-4 right-4 mb-2 bg-[var(--bg-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-elevated)] border border-[var(--color-border)] z-50 overflow-hidden">
                        <Link
                            href="/lab"
                            className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                        >
                            <FlaskConical className="h-4 w-4" />
                            <span>Lab (Advanced)</span>
                        </Link>
                        <Link
                            href="/about"
                            className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                        >
                            <Microscope className="h-4 w-4" />
                            <span>About</span>
                        </Link>
                        <Link
                            href="/settings"
                            className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                        >
                            <Settings className="h-4 w-4" />
                            <span>Settings</span>
                        </Link>
                        <button
                            onClick={async () => {
                                void triggerSelectionHaptic();
                                await handleLogout();
                            }}
                            disabled={isLoggingOut}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-50"
                        >
                            <LogOut className="h-4 w-4" />
                            <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
