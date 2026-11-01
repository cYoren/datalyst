import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Privacy Policy</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Effective date: 2026-01-23</p>
                </header>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Who we are</h2>
                    <p>
                        Datalyst is a habit and self-experimentation platform and a project by Medhub, based in Brazil.
                        This policy applies to our websites, apps, and services.
                    </p>
                    <p>
                        Contact: <Link className="text-[var(--color-accent)] hover:underline" href="mailto:contato@medicinahub.com.br">contato@medicinahub.com.br</Link>
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Data we collect</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Account details: email, name, locale, timezone, theme.</li>
                        <li>Habits and entries: logs, notes, and subvariable values.</li>
                        <li>Usage logs: session timestamps and events.</li>
                        <li>Consent records for health-related data.</li>
                    </ul>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">How we use data</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Provide and personalize the service.</li>
                        <li>Generate insights and analytics for your habits.</li>
                        <li>Maintain security, prevent abuse, and ensure reliability.</li>
                    </ul>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Legal bases</h2>
                    <p>
                        We process data based on contract performance (providing the service), legitimate interests
                        (security and product improvements), and explicit consent where required, such as for health-related data.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Sharing and transfers</h2>
                    <p>
                        We use service providers such as hosting, database, and authentication vendors. International
                        transfers may occur; we rely on contractual safeguards where required.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Retention</h2>
                    <p>
                        We keep personal data only as long as needed for the purposes described in this policy.
                        You can request deletion at any time in account settings.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Your rights</h2>
                    <p>
                        You can access, correct, export, or delete your data from the Settings page. If you need help,
                        contact us at the email above. These rights apply under LGPD and, where applicable, GDPR.
                    </p>
                </section>
            </div>
        </div>
    );
}
