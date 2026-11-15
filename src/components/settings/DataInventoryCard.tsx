'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { INVENTORY_PROMISE, POLICY_LINKS, dataInventory } from '@/lib/data-inventory';

/**
 * Settings → Your data (`ROADMAP.md` A6).
 *
 * The whole list, in the person's words, with the retention window the purge job actually keeps
 * and a link to the binding policy. If a row is not here, we do not store it.
 */
export function DataInventoryCard() {
    const inventory = dataInventory();

    return (
        <Card className="p-6 space-y-4 paper-lift mt-6">
            <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Your data</h2>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">{INVENTORY_PROMISE}</p>
            </div>

            <ul className="space-y-3">
                {inventory.map((thing) => (
                    <li key={thing.name} className="text-sm">
                        <p className="font-medium text-[var(--text-primary)]">
                            {thing.name}
                            <span className="ml-2 font-normal text-[var(--text-tertiary)]">
                                {thing.retentionDays === null
                                    ? 'kept until you delete it'
                                    : `deleted after ${thing.retentionDays} days`}
                            </span>
                        </p>
                        <p className="text-[var(--text-secondary)]">{thing.what}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {thing.why} · {thing.where}
                        </p>
                    </li>
                ))}
            </ul>

            <p className="text-xs text-[var(--text-tertiary)]">
                The binding wording is in the{' '}
                {POLICY_LINKS.map((link, index) => (
                    <React.Fragment key={link.href}>
                        {index > 0 && (index === POLICY_LINKS.length - 1 ? ' and the ' : ', the ')}
                        <Link href={link.href} className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]">
                            {link.label.toLowerCase()}
                        </Link>
                    </React.Fragment>
                ))}
                .
            </p>
        </Card>
    );
}
