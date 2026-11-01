'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
    duration?: number;
}

interface ToastContextType {
    showToast: (type: Toast['type'], message: string, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((type: Toast['type'], message: string, duration = 3000) => {
        const id = Math.random().toString(36).slice(2);
        const toast: Toast = { id, type, message, duration };

        setToasts(prev => [...prev, toast]);

        if (duration > 0) {
            setTimeout(() => removeToast(id), duration);
        }
    }, [removeToast]);

    const success = useCallback((message: string) => showToast('success', message), [showToast]);
    const error = useCallback((message: string) => showToast('error', message, 5000), [showToast]);
    const info = useCallback((message: string) => showToast('info', message), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, success, error, info }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-24 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const icons = {
        success: <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />,
        error: <XCircle className="h-5 w-5 text-[var(--color-error)]" />,
        info: <AlertCircle className="h-5 w-5 text-[var(--color-accent)]" />,
    };

    const backgrounds = {
        success: 'border-[var(--color-success)]/50',
        error: 'border-[var(--color-error)]/50',
        info: 'border-[var(--color-accent)]/50',
    };

    return (
        <div
            className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)] border bg-[var(--color-bg-subtle)] shadow-[var(--shadow-elevated)]",
                "animate-slide-up min-w-[280px] max-w-[400px]",
                backgrounds[toast.type]
            )}
        >
            {icons[toast.type]}
            <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)]">{toast.message}</span>
            <button
                onClick={onDismiss}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
