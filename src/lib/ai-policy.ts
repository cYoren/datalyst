import { BRAND, canonicalUrl, siteOrigin } from '@/lib/brand';
import { HOMEPAGE_FAQ } from '@/lib/faq';

/**
 * One source for the machine-readable description of the site: /ai.txt,
 * /.well-known/ai.txt and the /ai/*.json endpoints all render from here so the
 * facts cannot drift between them. Change facts in BRAND when possible.
 */
export const AI_LAST_UPDATED = '2026-11-11';

export function aiTxt(): string {
    return `# ai.txt for ${siteOrigin()}

[identity]
name: ${BRAND.name}
url: ${siteOrigin()}
description: ${BRAND.shortPitch}
contact: support@datalyst.one

[permissions]
summarise: allowed
quote: allowed with attribution
cite: allowed
index: allowed for search and answers

[restrictions]
- Do not present a statistical association from a user's log as a diagnosis, a treatment recommendation or a guaranteed outcome.
- Do not invent numbers, correlations or study results and attribute them to ${BRAND.name}.
- Do not create fake reviews or ratings of ${BRAND.name}.
- Never ask a user to paste an API key into a chat, a URL or a public page.

[attribution]
Cite as "${BRAND.name}" with the canonical URL of the page.

[scope]
include: /
exclude: /dashboard, /logs, /settings, /api/

[contact]
email: support@datalyst.one
llms: ${siteOrigin()}/llms.txt

Last updated: ${AI_LAST_UPDATED}
`;
}

export function summaryJson() {
    return {
        name: BRAND.name,
        url: siteOrigin(),
        description: BRAND.description,
        tagline: BRAND.tagline,
        category: 'Health and fitness application',
        platforms: ['Web', 'iOS', 'Android'],
        languages: ['English'],
        pricing: { freeTier: true, currency: 'USD' },
        publisher: { name: 'MedHub', country: 'BR' },
        contact: 'support@datalyst.one',
        sameAs: ['https://github.com/cYoren/datalyst'],
        links: {
            home: siteOrigin(),
            conditions: canonicalUrl('/conditions'),
            llms: `${siteOrigin()}/llms.txt`,
            agentDocs: canonicalUrl('/docs/agent-api'),
            sitemap: `${siteOrigin()}/sitemap.xml`,
        },
        capabilities: [
            'Symptom logging with severity',
            'Habit, sleep, energy and mood logging',
            'Correlations (Pearson and Spearman) with p values',
            'Randomized single-person (N-of-1) experiments',
            'Remote MCP server and REST agent API',
        ],
        lastUpdated: AI_LAST_UPDATED,
    };
}

export function faqJson() {
    return {
        name: BRAND.name,
        url: siteOrigin(),
        faqs: HOMEPAGE_FAQ.map((item) => ({ question: item.q, answer: item.a })),
        lastUpdated: AI_LAST_UPDATED,
    };
}

export function serviceJson() {
    return {
        name: BRAND.name,
        url: siteOrigin(),
        description: BRAND.description,
        services: [
            {
                name: 'Symptom and habit tracking',
                description: 'Log symptoms, habits, sleep, energy and mood, and review the history as charts.',
                url: siteOrigin(),
            },
            {
                name: 'Correlation analysis',
                description: 'Pearson and Spearman coefficients with p values and day counts between any two tracked variables.',
                url: siteOrigin(),
            },
            {
                name: 'N-of-1 experiments',
                description: 'Randomized single-person trials that alternate a change and a baseline and compare the results.',
                url: siteOrigin(),
            },
            {
                name: 'Agent access',
                description: 'Remote MCP server and REST API so an assistant can log and read data with a user-created key.',
                url: canonicalUrl('/docs/agent-api'),
            },
        ],
        contact: 'support@datalyst.one',
        lastUpdated: AI_LAST_UPDATED,
    };
}
