import { MetadataRoute } from 'next';
import { canonicalUrl } from '@/lib/brand';

// AI crawlers are named explicitly, next to the wildcard, so the public pages
// (/conditions, the landing) stay readable by assistants answering "what is a
// symptom tracker" questions. Private app paths stay out for everyone.
const AI_CRAWLERS = [
    "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
    "meta-webindexer", "meta-externalfetcher",
    "GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
    const disallow = [
        '/dashboard',
        '/habits',
        '/data',
        '/levels',
        '/lab',
        '/logs',
        '/settings',
        '/onboarding',
        '/about',
        '/api/',
    ];

    return {
        rules: [
            { userAgent: AI_CRAWLERS, allow: '/', disallow },
            { userAgent: '*', allow: '/', disallow },
        ],
        sitemap: canonicalUrl('/sitemap.xml'),
    };
}
