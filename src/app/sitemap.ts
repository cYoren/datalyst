import { MetadataRoute } from 'next';
import { canonicalUrl } from '@/lib/brand';
import { CONDITIONS, conditionPath } from '@/lib/conditions';

export default function sitemap(): MetadataRoute.Sitemap {
    // Omit lastmod until each page has a tracked content revision. A build or
    // request timestamp does not mean its content changed.
    const page = (path: string, changeFrequency: 'weekly' | 'monthly' | 'yearly', priority: number) => ({
        url: canonicalUrl(path),
        changeFrequency,
        priority,
    });

    return [
        page('/', 'weekly', 1.0),
        page('/docs/agent-api', 'monthly', 0.6),
        page('/conditions', 'monthly', 0.8),
        ...CONDITIONS.map((condition) => page(conditionPath(condition), 'monthly', 0.75)),
        page('/contact', 'monthly', 0.4),
        page('/privacy', 'yearly', 0.3),
        page('/terms', 'yearly', 0.3),
        page('/cookies', 'yearly', 0.2),
    ];
}
