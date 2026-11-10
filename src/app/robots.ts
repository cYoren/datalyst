import { MetadataRoute } from 'next';
import { canonicalUrl } from '@/lib/brand';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/dashboard',
                '/habits',
                '/data',
                '/lab',
                '/logs',
                '/settings',
                '/onboarding',
                '/about',
                '/api/',
            ],
        },
        sitemap: canonicalUrl('/sitemap.xml'),
    };
}
