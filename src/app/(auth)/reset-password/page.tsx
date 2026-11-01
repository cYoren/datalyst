'use client';

import Image from 'next/image';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/error-utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Loader2, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ResetPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
            });

            if (error) throw error;

            setSuccess(true);
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to send recovery email'));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-page)]">
                <Card className="w-full max-w-md p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="h-16 w-16 rounded-full bg-[var(--color-teal)]/15 flex items-center justify-center">
                            <CheckCircle className="h-8 w-8 text-[var(--color-teal)]" suppressHydrationWarning />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                        Email sent!
                    </h2>
                    <p className="text-[var(--text-secondary)] mb-6">
                        We sent a recovery link to <strong>{email}</strong>.
                        Click the link to reset your password.
                    </p>
                    <Button onClick={() => window.location.href = '/login'} className="w-full">
                        Back to login
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-page)]">
            <Card className="w-full max-w-md p-8">
                <div className="mb-8 text-center">
                    <Link href="/" className="label-mono mb-6 inline-flex items-center gap-2 text-[var(--text-primary)]">
                        <Image src="/assets/logo.png" alt="" width={24} height={24} className="rounded-[6px]" />
                        Datalyst
                    </Link>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
                        Reset password
                    </h1>
                    <p className="text-[var(--text-secondary)]">
                        Enter your email to receive a recovery link
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-[var(--color-coral)]/10 border border-[var(--color-coral)]/40 rounded-[var(--radius-card)] flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-[var(--color-coral)] flex-shrink-0 mt-0.5" suppressHydrationWarning />
                        <p className="text-sm text-[var(--color-coral)]">{error}</p>
                    </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" suppressHydrationWarning />
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@email.com"
                                required
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" suppressHydrationWarning />
                                Sending...
                            </>
                        ) : (
                            'Send recovery link'
                        )}
                    </Button>
                </form>

                <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
                    Remember your password?{' '}
                    <Link href="/login" className="text-[var(--color-accent)] hover:underline font-medium">
                        Back to login
                    </Link>
                </p>
            </Card>
        </div>
    );
}
