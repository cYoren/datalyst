import { cn } from '@/lib/utils';

/** Numbered mono section label, e.g. "01 / Insights", matching the landing page's label bars. */
export function SectionLabel({ children, aside, className, id }: {
    /** @deprecated numbering removed; kept so call sites compile. */
    index?: number;
    children: React.ReactNode;
    aside?: React.ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <div className={cn('flex items-center justify-between gap-3', className)}>
            <h2 id={id} className="m-0 text-base font-semibold text-[var(--text-primary)]">
                {children}
            </h2>
            {aside}
        </div>
    );
}
