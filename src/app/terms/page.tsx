export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Terms of Service</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Effective date: 2026-01-23</p>
                </header>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Provider</h2>
                    <p>
                        Datalyst is a project by Medhub, based in Brazil. Contact us at contato@medicinahub.com.br.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Use of the service</h2>
                    <p>
                        Datalyst provides tools for habit tracking and personal experimentation. You are responsible for
                        the accuracy of the data you submit and for keeping your account credentials secure.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Health and wellness disclaimer</h2>
                    <p>
                        Datalyst is not a medical device and does not provide medical advice. Consult a qualified
                        professional for medical guidance. Any insights provided are informational only.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Availability</h2>
                    <p>
                        We may update, suspend, or discontinue features at any time. We will try to provide notice for
                        material changes that affect your use of the service.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Account termination</h2>
                    <p>
                        You can delete your account at any time from Settings. We may suspend accounts that violate
                        these terms or applicable laws.
                    </p>
                </section>
            </div>
        </div>
    );
}
