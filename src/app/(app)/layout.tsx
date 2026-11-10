'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Calendar, Plus, PlusCircle, Settings, BarChart3, FlaskConical, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/ui/UserMenu';
import { ToastProvider } from '@/components/ui/Toast';
import { SWRProvider } from '@/providers/SWRProvider';
import { triggerSelectionHaptic } from '@/lib/haptics';
import { syncHealth } from '@/lib/health';
import Image from 'next/image';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [user, setUser] = useState<{ id?: string; email?: string; name?: string } | null>(null);
    const [currentHash, setCurrentHash] = useState('');

    useEffect(() => {
        const loadUser = async () => {
            try {
                const res = await fetch('/api/user');
                if (res.ok) {
                    const data = await res.json();
                    if (data.email) {
                        setUser({
                            id: data.id,
                            email: data.email,
                            name: data.name || data.email.split('@')[0]
                        });
                        return;
                    }
                }
            } catch (error) {
                console.error('API user fetch failed, falling back to auth session:', error);
            }

            try {
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                const { data: { user: authUser } } = await supabase.auth.getUser();

                if (authUser?.email) {
                    setUser({
                        id: authUser.id,
                        email: authUser.email,
                        name: authUser.email.split('@')[0]
                    });
                }
            } catch (authError) {
                console.error('Auth session fetch failed:', authError);
            }
        };

        loadUser();
    }, []);

    // Health import: on app open and whenever the app comes back to the foreground. No-op unless connected.
    useEffect(() => {
        void syncHealth();
        const onVisible = () => { if (document.visibilityState === 'visible') void syncHealth(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    useEffect(() => {
        const syncHash = () => {
            if (typeof window !== 'undefined') {
                setCurrentHash(window.location.hash || '');
            }
        };

        syncHash();
        window.addEventListener('hashchange', syncHash);
        return () => window.removeEventListener('hashchange', syncHash);
    }, [pathname]);

    const navItems = [
        { href: '/dashboard', icon: Calendar, label: 'Dashboard' },
        { href: '/data', icon: BarChart3, label: 'Data' },
        { href: '/levels', icon: Activity, label: 'Levels', title: 'What is still in you at bedtime' },
        { href: '/habits/templates', icon: BookOpen, label: 'Templates' },
        { href: '/settings', icon: Settings, label: 'Settings' },
        { href: '/habits/new', icon: PlusCircle, label: 'Create tracker' },
        { href: '/lab', icon: FlaskConical, label: 'Experiments', title: 'Test what works for you' },
    ];

    const mobileNavItems = [
        { href: '/dashboard', icon: Calendar, label: 'Dashboard' },
        { href: '/habits/new', icon: Plus, label: 'Create', isCreate: true },
        { href: '/data', icon: BarChart3, label: 'Data' },
    ];

    const isItemActive = (href: string) => {
        const [basePath, hash] = href.split('#');
        return href.includes('#')
            ? pathname === basePath && currentHash === `#${hash}`
            : pathname === href && currentHash !== '#daily-checkin';
    };

    return (
        <div data-app-shell className="min-h-screen bg-[var(--bg-app)] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:pb-0 sm:pt-0 sm:pl-64">
            {/* Desktop Sidebar */}
            <aside className="hidden sm:flex fixed inset-y-0 left-0 w-64 flex-col bg-[var(--color-bg-app)] border-r border-[var(--color-border)]">
                <Link href="/dashboard" className="flex h-[60px] items-center gap-2.5 border-b border-[var(--color-border)] px-5 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                    <Image src="/assets/logo.png" alt="" width={28} height={28} className="rounded-[7px]" />
                    Datalyst
                </Link>

                <nav className="flex-1 py-3" aria-label="Main">
                    {navItems.map((item) => {
                        const isActive = isItemActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                suppressHydrationWarning
                                aria-current={isActive ? 'page' : undefined}
                                {...('title' in item && item.title ? { title: item.title } : {})}
                                className={cn(
                                    "mx-3 flex items-center gap-3 rounded-[var(--radius-button)] px-3 py-2.5 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                                        : "text-[var(--text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-[var(--color-accent)]")} suppressHydrationWarning />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User Menu for Desktop */}
                {user && <UserMenu user={user} variant="desktop" />}
            </aside>

            {/* Mobile Bottom Nav */}
            <nav aria-label="Main" className="sm:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around border-t border-[var(--color-border)] bg-[rgba(18,19,22,0.92)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md">
                {mobileNavItems.map(item => {
                    const isActive = isItemActive(item.href);
                    const isCreate = 'isCreate' in item && item.isCreate;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            suppressHydrationWarning
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={isCreate ? 'Create tracker' : undefined}
                            className={cn(
                                "flex flex-col items-center justify-center p-2 transition-colors w-full min-h-[48px]",
                                isActive
                                    ? "text-[var(--color-text-primary)]"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            )}
                            onClick={() => {
                                void triggerSelectionHaptic();
                            }}
                        >
                            {isCreate ? (
                                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-text-primary)] text-[var(--color-on-accent)]">
                                    <item.icon className="h-5 w-5" suppressHydrationWarning />
                                </span>
                            ) : (
                                <>
                                    <item.icon className={cn("h-5 w-5 mb-1", isActive && "text-[var(--color-accent)]")} suppressHydrationWarning />
                                    <span className="text-[11px] font-medium">{item.label}</span>
                                </>
                            )}
                        </Link>
                    );
                })}
                {/* User Menu for Mobile */}
                {user && <UserMenu user={user} variant="mobile" />}
            </nav>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto px-4 py-5 sm:px-8 sm:py-8 animate-fade-in min-h-screen-safe">
                <SWRProvider ownerId={user?.id}>
                    <ToastProvider>
                        {children}
                    </ToastProvider>
                </SWRProvider>
            </main>
        </div>
    );
}
