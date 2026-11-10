'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';


interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
    const [mounted, setMounted] = React.useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            cancelAnimationFrame(frame);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in"
                onClick={onClose}
            />

            {/* Content */}
            <div className="relative w-full max-w-lg border border-[var(--color-border-hover)] bg-[var(--bg-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-elevated)] animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] font-display">{title}</h2>
                    <button
                        onClick={onClose}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] hover:bg-[var(--color-bg-subtle)] text-[var(--text-secondary)] transition-colors"
                    >
                        <X className="h-5 w-5" suppressHydrationWarning />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};
