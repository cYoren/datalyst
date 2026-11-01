import Link from 'next/link';

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Contact</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        Reach us for privacy requests, support, or partnership inquiries.
                    </p>
                </header>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Company</h2>
                    <p>
                        Datalyst is a project by Medhub, based in Brazil.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Privacy and data requests</h2>
                    <p>
                        Email <Link className="text-[var(--color-accent)] hover:underline" href="mailto:support@datalyst.one">support@datalyst.one</Link>
                        for access, correction, export, or deletion requests.
                    </p>
                </section>

                <section className="space-y-3 text-[var(--text-secondary)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">General support</h2>
                    <p>
                        Email <Link className="text-[var(--color-accent)] hover:underline" href="mailto:support@datalyst.one">support@datalyst.one</Link>
                        for product issues or feedback.
                    </p>
                </section>
            </div>
        </div>
    );
}
