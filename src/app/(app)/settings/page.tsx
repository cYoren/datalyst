'use client';

import { useEffect, useState } from 'react';
import { AiInsightsPanel } from '@/components/insights/AiInsightsPanel';
import { useUser } from '@/lib/hooks';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { ReminderControl } from '@/components/ui/ReminderControl';
import { HealthImportControl } from '@/components/ui/HealthImportControl';
import { clearWidget } from '@/lib/widget';
import { ApiKeysCard } from '@/components/settings/ApiKeysCard';
import { CloudCard } from '@/components/settings/CloudCard';
import { ConnectAiCard } from '@/components/settings/ConnectAiCard';

const TIMEZONES = ['UTC', 'America/Sao_Paulo', 'Europe/Lisbon', 'Europe/London', 'America/New_York'];
const LOCALES = ['en-US', 'pt-BR', 'es-ES'];

export default function SettingsPage() {
    const { user, isLoading, refresh } = useUser();
    const [profile, setProfile] = useState({
        name: '',
        timezone: 'UTC',
        locale: 'en-US',
        healthDataConsent: false,
    });
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [archiveConfirm, setArchiveConfirm] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (user?.profile) {
            setProfile({
                name: user.profile.name || '',
                timezone: user.profile.timezone || 'UTC',
                locale: user.profile.locale || 'en-US',
                healthDataConsent: !!user.profile.healthDataConsent,
            });
        }
    }, [user]);

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/user', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profile.name,
                    timezone: profile.timezone,
                    locale: profile.locale,
                    healthDataConsent: profile.healthDataConsent,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update profile');
            }

            setMessage('Profile updated.');
            await refresh();
        } catch {
            setMessage('Unable to save changes. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        setMessage('');
        try {
            const res = await fetch('/api/user/export');
            if (!res.ok) {
                throw new Error('Export failed');
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const contentDisposition = res.headers.get('content-disposition') || '';
            const match = contentDisposition.match(/filename="(.+)"/);
            const filename = match?.[1] || 'datalyst-export.json';

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            setMessage('Unable to export data. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async (file: File | undefined) => {
        if (!file) return;
        setImporting(true);
        setMessage('');
        try {
            const res = await fetch('/api/user/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: await file.text(),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Import failed');
            setMessage(`Imported ${payload.trackers} trackers and ${payload.entries} check-ins.`);
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : 'Import failed. Please try again.');
        } finally {
            setImporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirm !== 'DELETE') {
            setMessage('Type DELETE to confirm account deletion.');
            return;
        }

        setDeleting(true);
        setMessage('');
        try {
            const res = await fetch('/api/user', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: deleteConfirm }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || 'Deletion failed');
            }

            const supabase = createClient();
            await supabase.auth.signOut();
            // Last, so no in-flight dashboard fetch refills the home screen widget.
            await clearWidget();
            window.location.href = '/';
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : 'Unable to delete account. Please contact support.');
        } finally {
            setDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 pb-20">
                <div className="h-8 w-48 rounded bg-[var(--color-bg-subtle)]" />
                <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]" />
                <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-bg-card)]" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="py-12 text-center text-[var(--text-tertiary)]">
                Please sign in to manage your account.
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            <header className="space-y-2">
                <h1 className="text-3xl sm:text-[2.6rem] leading-[1.05] font-semibold text-[var(--text-primary)]">Settings</h1>
                <p className="text-[var(--text-secondary)]">
                    Manage your profile, privacy preferences, and account data.
                </p>
                {message && (
                    <p className="text-sm text-[var(--text-secondary)]">{message}</p>
                )}
            </header>

            <ConnectAiCard />

            <CloudCard onExport={handleExport} />

            <AiInsightsPanel settings />

            <Card className="p-6 space-y-5 paper-lift">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Profile</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        Update the information we use to personalize your experience.
                    </p>
                </div>
                <div className="space-y-4">
                    <Input
                        label="Name"
                        value={profile.name}
                        onChange={(event) => setProfile(prev => ({ ...prev, name: event.target.value }))}
                        placeholder="Your name"
                    />
                    <Input
                        label="Email (read-only)"
                        value={user.email || ''}
                        readOnly
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <label className="label-mono block space-y-2">
                            <span>Timezone</span>
                            <select
                                className="h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-bg-card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                                value={profile.timezone}
                                onChange={(event) => setProfile(prev => ({ ...prev, timezone: event.target.value }))}
                            >
                                {TIMEZONES.map((zone) => (
                                    <option key={zone} value={zone}>{zone}</option>
                                ))}
                            </select>
                        </label>
                        <label className="label-mono block space-y-2">
                            <span>Locale</span>
                            <select
                                className="h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-control-border)] bg-[var(--color-bg-card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                                value={profile.locale}
                                onChange={(event) => setProfile(prev => ({ ...prev, locale: event.target.value }))}
                            >
                                {LOCALES.map((locale) => (
                                    <option key={locale} value={locale}>{locale}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div>
                        <Button onClick={handleSave} isLoading={saving}>
                            Save changes
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="mt-6">
                <ReminderControl />
            </div>

            <div className="mt-6">
                <HealthImportControl />
            </div>

            <Card className="p-6 space-y-4 paper-lift mt-6">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Privacy and consent</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        We only process health-related data with your explicit consent.
                    </p>
                </div>
                <label className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                    <input
                        type="checkbox"
                        className="mt-1 h-11 w-11 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                        checked={profile.healthDataConsent}
                        onChange={(event) => setProfile(prev => ({ ...prev, healthDataConsent: event.target.checked }))}
                    />
                    <span>
                        I consent to the processing of health-related data (for example, sleep or mood logs).
                    </span>
                </label>
                <Button variant="outline" onClick={handleSave} isLoading={saving}>
                    Save privacy preferences
                </Button>
            </Card>

            <Card className="p-6 space-y-4 paper-lift mt-6">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Export and import</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        Download a JSON file with your profile, trackers, entries, and logs. Import one from another
                        Datalyst (Cloud or self-hosted) to add its trackers and check-ins here.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={handleExport} isLoading={exporting}>
                        Download data export
                    </Button>
                    <label className={buttonVariants({ variant: 'outline', className: 'cursor-pointer' })}>
                            {importing ? 'Importing…' : 'Import export file'}
                            <input
                                type="file"
                                accept="application/json,.json"
                                className="sr-only"
                                disabled={importing}
                                onChange={(event) => { void handleImport(event.target.files?.[0]); event.target.value = ''; }}
                            />
                    </label>
                </div>
            </Card>

            <ApiKeysCard />

            <Card className="p-6 space-y-4 paper-lift mt-6">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Archive all trackers</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        Hides every tracker from Check-in. Logged data stays in your history and export.
                    </p>
                </div>
                {archiveConfirm ? (
                    <div className="flex gap-3">
                        <Button
                            variant="destructive"
                            isLoading={archiving}
                            onClick={async () => {
                                // Soft archive, one tracker at a time. The old dashboard
                                // button called DELETE /api/demo/setup, which erased entries.
                                setArchiving(true);
                                let ok = false;
                                try {
                                    const res = await fetch('/api/habits');
                                    const habits: { id: string }[] = res.ok ? await res.json() : [];
                                    const results = await Promise.all(habits.map((h) => fetch(`/api/habits/${h.id}`, { method: 'DELETE' })));
                                    ok = res.ok && results.every((r) => r.ok);
                                } catch { /* reported below */ }
                                setArchiving(false);
                                setArchiveConfirm(false);
                                setMessage(ok ? 'All trackers archived.' : 'Some trackers could not be archived. Try again.');
                            }}
                        >
                            Yes, archive all
                        </Button>
                        <Button variant="outline" onClick={() => setArchiveConfirm(false)}>Cancel</Button>
                    </div>
                ) : (
                    <Button variant="outline" onClick={() => setArchiveConfirm(true)}>Archive all trackers</Button>
                )}
            </Card>

            <Card className="p-6 space-y-4 paper-lift  border border-[var(--color-coral)]/40 mt-6">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--color-coral)]">Delete account</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        This permanently removes your data and cannot be undone.
                    </p>
                </div>
                <Input
                    label="Type DELETE to confirm"
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder="DELETE"
                />
                <Button variant="destructive" onClick={handleDeleteAccount} isLoading={deleting}>
                    Delete my account
                </Button>
            </Card>
        </div>
    );
}
