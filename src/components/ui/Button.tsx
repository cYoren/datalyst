"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { triggerSelectionHaptic } from "@/lib/haptics"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] font-mono text-xs font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-app)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
    {
        variants: {
            variant: {
                // Solid light primary, as on the landing page.
                default: "border border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-on-accent)] hover:bg-[var(--color-bg-card)]",
                destructive:
                    "border border-[var(--color-error)] bg-[var(--color-error)] text-[var(--color-on-accent)] hover:brightness-110",
                outline:
                    "border border-[var(--color-border-hover)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]",
                secondary:
                    "border border-[var(--color-accent)]/45 bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:border-[var(--color-accent)]",
                ghost: "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]",
                link: "font-sans text-sm normal-case tracking-normal text-[var(--color-accent)] underline-offset-4 hover:underline",
                data: "border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
            },
            size: {
                default: "h-11 px-5",
                sm: "h-11 px-4",
                lg: "h-13 px-8",
                icon: "h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
    isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, isLoading = false, children, onClick, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={isLoading || props.disabled}
                onClick={(event: React.MouseEvent<HTMLElement>) => {
                    if (!props.disabled && !isLoading) {
                        void triggerSelectionHaptic();
                    }
                    onClick?.(event as React.MouseEvent<HTMLButtonElement>);
                }}
                {...props}
            >
                {/* Don't render Loader2 when asChild - Slot requires exactly one child */}
                {!asChild && isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </Comp>
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
