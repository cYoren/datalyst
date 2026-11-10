import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Keep sign-in and password recovery out of search. Crawlers must be able to
// fetch these pages to read noindex; do not block them in robots.txt.
export const metadata: Metadata = {
    robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
    return children;
}
