import * as React from "react"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    elevated?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, elevated = false, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] transition-colors",
                elevated && "border-[var(--color-border-hover)]",
                className
            )}
            {...props}
        />
    )
)
Card.displayName = "Card"

export { Card }
