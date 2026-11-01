'use client';

import { Capacitor } from '@capacitor/core';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

const STORAGE_KEY = 'datalyst_cookie_notice_v1';

export function CookieNotice() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const acknowledged = window.localStorage.getItem(STORAGE_KEY);
        // Deliberately hydrate from localStorage after the first render to avoid SSR/client markup divergence.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisible(!acknowledged);
    }, []);

    const handleAccept = () => {
        window.localStorage.setItem(STORAGE_KEY, 'acknowledged');
        setVisible(false);
    };

    if (SELF_HOSTED || (typeof window !== 'undefined' && Capacitor.isNativePlatform())) return null;
    if (!visible) return null;

    return (
        <div className="px-3 py-4 sm:fixed sm:inset-x-0 sm:bottom-4 sm:z-50 sm:px-4">
            <div className="max-w-3xl mx-auto rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-elevated)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">
                        We use essential cookies to keep you signed in and secure your session.
                        <Link href="/cookies" className="ml-1 inline-flex min-h-[44px] items-center text-[var(--color-accent)] hover:underline">
                            Learn more
                        </Link>
                        .
                    </p>
                    <Button onClick={handleAccept} size="sm" className="w-full shrink-0 sm:w-auto">
                        Got it
                    </Button>
                </div>
            </div>
        </div>
    );
}
