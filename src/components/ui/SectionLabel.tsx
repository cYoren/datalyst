import { cn } from '@/lib/utils';

/** Numbered mono section label, e.g. "01 / Insights", matching the landing page's label bars. */
export function SectionLabel({ index, children, aside, className, id }: {
    index?: number;
    children: React.ReactNode;
    aside?: React.ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <div className={cn('label-mono flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3', className)}>
            <h2 id={id} className="m-0 font-[inherit] text-[length:inherit] font-medium tracking-[inherit]">
                {index !== undefined && <b>{String(index).padStart(2, '0')}</b>}
                {index !== undefined && ' / '}
                {children}
            </h2>
            {aside}
        </div>
    );
}
