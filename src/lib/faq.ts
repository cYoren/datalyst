/**
 * The questions people actually ask before they start, answered once.
 *
 * Rendered as a visible section on the homepage (which is what AI answers can
 * quote) and reused by /ai/faq.json and the FAQPage JSON-LD, so the three can
 * never disagree.
 */
export type FaqItem = { q: string; a: string };

export const HOMEPAGE_FAQ: FaqItem[] = [
    {
        q: 'What is Datalyst?',
        a: 'A symptom and habit tracker for web, iOS and Android. You log how you feel and what you do, and Datalyst shows which habits move together with your symptoms before you run a personal experiment.',
    },
    {
        q: 'Is it free?',
        a: 'Tracking is free to start. The paid plan is for people who log every day and want the full history, more trackers and more experiments. The source code is published under AGPL-3.0 if you would rather self-host it.',
    },
    {
        q: 'Does it diagnose anything?',
        a: 'No. Datalyst records and compares what you logged. A correlation of 0.62 with a p value of 0.004 over 42 days says the two things moved together in your record, not that one caused the other. That is a question for your clinician.',
    },
    {
        q: 'How does the statistics work?',
        a: 'Any two variables logged on the same days are compared with a Pearson and a Spearman coefficient, with a p value and the number of days behind it. A pattern worth testing becomes a randomized N-of-1 experiment that alternates the change and the baseline in blocks.',
    },
    {
        q: 'Can ChatGPT or Claude log data for me?',
        a: 'Yes, with a key you create in Settings. Datalyst runs a remote MCP server and a REST agent API, both scoped to your own data and revocable at any time.',
    },
];
