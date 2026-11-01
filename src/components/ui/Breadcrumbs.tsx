'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const segmentLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    habits: 'Trackers',
    new: 'New',
    edit: 'Edit',
    lab: 'Lab',
    data: 'Data',
    logs: 'Logs',
    settings: 'Settings',
    about: 'About',
};

interface BreadcrumbsProps {
    overrides?: Record<string, string>;
}

export function Breadcrumbs({ overrides }: BreadcrumbsProps) {
    const pathname = usePathname();

    if (pathname === '/dashboard') return null;

    const segments = pathname.split('/').filter(Boolean);
    const crumbs = segments.map((segment, i) => {
        const href = '/' + segments.slice(0, i + 1).join('/');
        const label = overrides?.[segment] || segmentLabels[segment] || segment;
        const isLast = i === segments.length - 1;
        return { href, label, isLast };
    });

    return (
        <nav aria-label="Breadcrumb" className="label-mono flex items-center gap-2 mb-4">
            {crumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    {crumb.isLast ? (
                        <span aria-current="page" className="text-[var(--text-primary)]">{crumb.label}</span>
                    ) : (
                        <Link href={crumb.href} className="hover:text-[var(--text-primary)] transition-colors">
                            {crumb.label}
                        </Link>
                    )}
                </span>
            ))}
        </nav>
    );
}
