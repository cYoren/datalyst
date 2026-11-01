import Link from 'next/link';

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Cookie Notice</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Effective date: 2026-01-23</p>
                </header>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">What we use</h2>
                    <p>
                        We use essential cookies to keep you signed in and to secure your session. These cookies are
                        required for the service to work.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Types of cookies</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Authentication cookies managed by our identity provider.</li>
                        <li>Security cookies that protect against abuse.</li>
                    </ul>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Managing cookies</h2>
                    <p>
                        You can control cookies in your browser settings. Disabling essential cookies may prevent
                        the app from functioning correctly.
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
