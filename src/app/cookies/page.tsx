import Link from 'next/link';
import { withCanonical } from '@/lib/brand';

export const metadata = withCanonical('/cookies', {
    title: 'Cookie Notice | Datalyst',
    description: 'How Datalyst uses essential cookies and local browser storage to keep you signed in.',
});

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Cookie Notice</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Last updated: 2026-11-09</p>
                </header>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Cookies</h2>
                    <p>
                        When you sign in, authentication and security cookies are used to maintain your session and
                        protect the service. They are needed for the signed-in features to work.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Other browser storage</h2>
                    <p>
                        Datalyst also uses local storage and session storage. These are browser storage, not cookies.
                        They support app features and can contain information linked to your account.
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>
                            The <code>datalyst-swr-cache</code> local-storage item keeps up to 512 KB of cached app API
                            responses on this device. Responses can include the symptoms, habits, check-ins, notes and
                            insights you entered. It records which account it belongs to and is only read back for that
                            account; it is cleared when you sign out or delete your account, and may also be cleared by
                            your browser.
                        </li>
                        <li>
                            Pending offline check-ins are kept in one local-storage item until they sync. Each row
                            records the account that wrote it and is replayed only under that account; a permanent
                            rejection or account deletion removes it. A row can include the tracker, variable, value,
                            date and note you entered.
                        </li>
                        <li>
                            Health-import settings, such as the selected metrics and the last sync time, are saved
                            locally per account. Health readings are not stored in this settings item.
                        </li>
                        <li>
                            Reminder settings, the review-prompt history and the cookie-notice acknowledgement are saved
                            on this device. A calendar swipe hint is kept for the current browser session only.
                        </li>
                    </ul>
                    <p>
                        Check-ins saved by older versions may not record an account. Datalyst never replays those under a
                        different account, and they may remain in browser storage until you clear site data in your
                        browser settings.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Managing cookies</h2>
                    <p>
                        You can control cookies and clear site storage in your browser settings. Blocking session
                        cookies or local storage may prevent sign-in or app features from working. Deleting an account
                        removes the local data this version of the app keeps for it on this device.
                    </p>
                    <p>
                        For more details, see our <Link className="text-[var(--color-accent)] hover:underline" href="/privacy">Privacy Policy</Link>.
                    </p>
                    <p>
                        Contact us at <Link className="text-[var(--color-accent)] hover:underline" href="mailto:contato@medicinahub.com.br">contato@medicinahub.com.br</Link>
                        with questions about cookies.
                    </p>
                </section>
            </div>
        </div>
    );
}
