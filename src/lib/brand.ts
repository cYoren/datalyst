import type { Metadata } from 'next';

/**
 * Public positioning. Health first: a symptom and habit tracker that shows
 * how what you do affects how you feel.
 *
 * English tagline is the equivalent of the Portuguese line below.
 * Home-screen name stays "Datalyst". Store titles are capped at 30 characters
 * (App Store name and Play title) and subtitles at 30. Play's short
 * description is capped at 80.
 */
export const BRAND = {
    name: 'Datalyst',
    homeScreenName: 'Datalyst',
    storeTitle: 'Datalyst: Symptom & Habit',
    storeTitlePt: 'Datalyst: Sintomas e Hábitos',
    storeSubtitle: 'See what affects your health',
    storeSubtitlePt: 'Veja o que afeta sua saúde',
    tagline: 'Log symptoms and habits and discover what affects your health.',
    taglinePt: 'Registre sintomas e hábitos e descubra o que afeta sua saúde.',
    title: 'Datalyst — Symptom, Habit & Biohacking Tracker',
    description:
        'Track symptoms, habits, sleep and energy. Find patterns and run personal experiments with Datalyst, a biohacking and health tracker.',
    ogDescription:
        'Track symptoms and habits, explore correlations, and run personal experiments. Built for self-tracking and biohacking.',
    shortPitch: 'A symptom, habit and biohacking tracker for finding patterns and running personal experiments.',
} as const;

const CANONICAL_HOST = 'www.datalyst.one';

/** Public site origin. The apex host redirects to www, so canonicals use www. */
export function siteOrigin(): string {
    const fallback = `https://${CANONICAL_HOST}`;
    const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || fallback;
    try {
        const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
        if (url.hostname === 'datalyst.one') url.hostname = CANONICAL_HOST;
        return url.origin;
    } catch {
        return fallback;
    }
}

export function canonicalUrl(path: string): string {
    const origin = siteOrigin();
    if (!path || path === '/') return origin;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${normalized}`;
}

export function withCanonical(path: string, metadata: Metadata = {}): Metadata {
    return {
        ...metadata,
        alternates: {
            ...metadata.alternates,
            canonical: canonicalUrl(path),
        },
    };
}
