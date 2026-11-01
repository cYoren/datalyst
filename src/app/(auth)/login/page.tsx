'use client';

import Image from 'next/image';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getErrorMessage, getErrorStatus } from '@/lib/error-utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import {
    finishNativeAuth,
    isNativeAppleAvailable,
    signInWithNativeApple,
    startOAuth,
} from '@/lib/native-auth';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const supabase = createClient();

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw error;
            }

            // Wait a bit for cookies to be set
            await new Promise(resolve => setTimeout(resolve, 100));

            router.push('/dashboard');
            router.refresh();
        } catch (err: unknown) {
            // Provide more specific error messages
            const message = getErrorMessage(err, 'Login failed');
            let errorMessage = message;

            if (message.includes('Invalid login credentials')) {
                errorMessage = 'Incorrect email or password. Please check your credentials.';
            } else if (message.includes('Email not confirmed')) {
                errorMessage = 'Please confirm your email before logging in.';
            } else if (getErrorStatus(err) === 400) {
                errorMessage = `Authentication error: ${message}. Please check if your email is confirmed.`;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleMagicLink = async () => {
        setLoading(true);
        setError('');

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) throw error;

            setMagicLinkSent(true);
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Error sending magic link'));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            await startOAuth('google');
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Error logging in with Google'));
            setLoading(false);
        }
    };

    const handleAppleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            if (isNativeAppleAvailable()) {
                await signInWithNativeApple();
                await finishNativeAuth(router);
            } else {
                await startOAuth('apple');
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Error logging in with Apple'));
            setLoading(false);
        }
    };

    if (magicLinkSent) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-page)]">
                <Card className="w-full max-w-md p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="h-16 w-16 rounded-full bg-[var(--color-accent)] bg-opacity-10 flex items-center justify-center">
                            <Mail className="h-8 w-8 text-[var(--color-accent)]" suppressHydrationWarning />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                        Check your email
                    </h2>
                    <p className="text-[var(--text-secondary)] mb-6">
                        We sent a magic link to <strong>{email}</strong>. Click the link to log in.
                    </p>
                    <Button variant="outline" onClick={() => setMagicLinkSent(false)} className="w-full">
                        Back
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
                        Welcome back
                    </h1>
                    <p className="text-[var(--text-secondary)]">
                        Log in to continue your journey
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-[var(--color-coral)]/10 border border-[var(--color-coral)]/40 rounded-[var(--radius-card)] flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-[var(--color-coral)] flex-shrink-0 mt-0.5" suppressHydrationWarning />
                        <p className="text-sm text-[var(--color-coral)]">{error}</p>
                    </div>
                )}

                <form onSubmit={handleEmailLogin} className="space-y-4">
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
                                placeholder="your@email.com"
                                required
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" suppressHydrationWarning />
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <Link
                            href="/reset-password"
                            className="text-[var(--color-accent)] hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" suppressHydrationWarning />
                                Logging in...
                            </>
                        ) : (
                            'Log In'
                        )}
                    </Button>
                </form>

                <div className="mt-6 relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[var(--color-border)]"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-[var(--color-bg-card)] text-[var(--text-tertiary)]">
                            or continue with
                        </span>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full mt-6 flex items-center justify-center gap-2"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>
                    Google
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    onClick={handleAppleLogin}
                    disabled={loading}
                    className="w-full mt-3 flex items-center justify-center gap-2"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    Sign in with Apple
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    onClick={handleMagicLink}
                    disabled={loading || !email}
                    className="w-full mt-3"
                >
                    <Mail className="h-4 w-4 mr-2" suppressHydrationWarning />
                    Magic Link (Email)
                </Button>

                <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
                    Don&apos;t have an account?{' '}
                    <Link href="/register" className="text-[var(--color-accent)] hover:underline font-medium">
                        Sign up
                    </Link>
                </p>
            </Card>
        </div>
    );
}
